package query

import (
	"context"
	"errors"
	"strconv"
	"sync"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/exclause"
	"github.com/nigowl/bitmagnet/internal/maps"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gen"
	"gorm.io/gen/field"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ResultItem struct {
	QueryStringRank float64
}

type GenericResult[T interface{}] struct {
	TotalCount           uint
	TotalCountIsEstimate bool
	HasNextPage          bool
	Items                []T
	Aggregations         Aggregations
}

type SubQueryFactory = func(context.Context, *dao.Query) SubQuery

// GenericQuery executes queries for any type of search and returns a GenericResult
func GenericQuery[T interface{}](
	_ctx context.Context,
	daoQ *dao.Query,
	option Option,
	tableName string,
	factory SubQueryFactory,
) (GenericResult[T], error) {
	gq := genericQuery[T]{
		daoQ:    daoQ,
		factory: factory,
	}
	builder, optionErr := option(newQueryContext(dbContext{
		q:         daoQ,
		tableName: tableName,
		factory:   factory,
	}))

	if optionErr != nil {
		return gq.result, optionErr
	}

	gq.ctx = builder.createContext(_ctx)
	gq.builder = builder
	wg := sync.WaitGroup{}
	wg.Add(3)

	//nolint:contextcheck
	go func() {
		defer wg.Done()
		gq.doItems()
	}()
	go func() {
		defer wg.Done()
		gq.doCount()
	}()
	go func() {
		defer wg.Done()

		if aggs, aggErr := gq.builder.calculateAggregations(gq.ctx); aggErr != nil {
			gq.addError(aggErr)
		} else {
			gq.result.Aggregations = aggs
		}
	}()
	wg.Wait()

	return gq.result, errors.Join(gq.errs...)
}

type genericQuery[T interface{}] struct {
	ctx     context.Context
	daoQ    *dao.Query
	factory SubQueryFactory
	builder OptionBuilder
	mtx     sync.Mutex
	errs    []error
	result  GenericResult[T]
}

func (gq *genericQuery[_]) newSubQuery(ctx context.Context, withOrder bool) (SubQuery, error) {
	sq := gq.factory(ctx, gq.daoQ)
	if selectErr := gq.builder.applySelect(sq.UnderlyingDB(), withOrder); selectErr != nil {
		return sq, selectErr
	}

	if preErr := gq.builder.applyPre(sq, withOrder); preErr != nil {
		return sq, preErr
	}

	return sq, nil
}

func (gq *genericQuery[_]) addError(err error) {
	gq.mtx.Lock()
	defer gq.mtx.Unlock()
	gq.errs = append(gq.errs, err)
}

func (gq *genericQuery[_]) checkExists(ctx context.Context) (bool, error) {
	sq, sqErr := gq.newSubQuery(ctx, false)
	if sqErr != nil {
		return false, sqErr
	}

	sql := dao.ToSQL(sq.UnderlyingDB().Select("*"))
	row := sq.UnderlyingDB().Raw("SELECT EXISTS(" + sql + ")")

	var exists bool

	if existsErr := row.Scan(&exists).Error; existsErr != nil {
		return false, existsErr
	}

	return exists, nil
}

func (gq *genericQuery[_]) doCount() {
	if gq.builder.withTotalCount() {
		sq, sqErr := gq.newSubQuery(gq.ctx, false)
		if sqErr != nil {
			gq.addError(sqErr)
			return
		}

		if countResult, countErr := dao.BudgetedCount(
			sq.UnderlyingDB(), gq.builder.AggregationBudget(),
		); countErr != nil {
			gq.addError(countErr)
		} else {
			gq.result.TotalCount = uint(countResult.Count)
			gq.result.TotalCountIsEstimate = countResult.BudgetExceeded
		}
	}
}

// doItems gets the items from the database and sets it to the result
//
// For querying the items, we have 2 possible strategies to try:
// - the default strategy is always tried, and is usually the most performant
// - for certain searches where items are filtered to a small number of results, and ordered with a limit,
// the default strategy can be very slow, so we try a CTE strategy, with order and limit on a materialized view of
// the complete results, and we put it in a race with the default strategy.
// The CTE strategy uses a stopping point, and will only return items where there are fewer than the stopping point.
func (gq *genericQuery[T]) doItems() {
	if !gq.builder.hasZeroLimit() || gq.builder.needsNextPage() {
		var finalItems []T

		doneChan := make(chan error)

		raceCtx, raceCancel := context.WithCancel(gq.ctx)
		defer raceCancel()

		mtx := sync.Mutex{}
		done := func(items []T, err error) {
			mtx.Lock()
			defer mtx.Unlock()

			if finalItems != nil || raceCtx.Err() != nil {
				return
			}

			if err == nil {
				// copy items slice to avoid modifying cached results
				finalItems = append([]T{}, items...)
			}
			doneChan <- err
		}
		// start the default strategy
		go func() {
			sq, sqErr := gq.newSubQuery(raceCtx, true)
			if sqErr != nil {
				done(nil, sqErr)
				return
			}

			if postErr := gq.builder.applyPost(sq.UnderlyingDB()); postErr != nil {
				done(nil, postErr)
				return
			}

			var items []T
			if txErr := sq.UnderlyingDB().Find(&items).Error; txErr != nil {
				done(nil, txErr)
				return
			}

			done(items, nil)
		}()

		if gq.builder.shouldTryCteStrategy() {
			// start the CTE strategy
			go func() {
				stoppingPoint := 50_000

				sqCte, sqCteErr := gq.newSubQuery(raceCtx, true)
				if sqCteErr != nil {
					done(nil, sqCteErr)
					return
				}

				sql := dao.ToSQL(sqCte.UnderlyingDB()) + " LIMIT " + strconv.Itoa(stoppingPoint)

				cte := gq.factory(raceCtx, gq.daoQ).UnderlyingDB().Clauses(
					exclause.NewWith("cte", sql, true),
					exclause.NewWith("cte_count", "SELECT COUNT(*) AS total_count FROM cte", true),
				).Table("cte").Where("(SELECT MAX(total_count) FROM cte_count) < " + strconv.Itoa(stoppingPoint))
				if postErr := gq.builder.applyPost(cte); postErr != nil {
					done(nil, postErr)
					return
				}

				var items []T
				if scanErr := cte.Scan(&items).Error; scanErr != nil {
					done(nil, scanErr)
					return
				}

				if len(items) == 0 {
					// if no items are returned, we need a further check
					// to distinguish between stopping point reached and no matching items
					exists, existsErr := gq.checkExists(raceCtx)
					if existsErr != nil {
						done(nil, existsErr)
						return
					}

					if exists {
						// the stopping point was reached, so return without calling `done`
						return
					}
				}

				done(items, nil)
			}()
		}
		select {
		case doneErr := <-doneChan:
			raceCancel()

			if doneErr != nil {
				gq.addError(doneErr)
				return
			}
		case <-raceCtx.Done():
			gq.addError(raceCtx.Err())
			return
		}

		if gq.builder.hasNextPage(len(finalItems)) {
			gq.result.HasNextPage = true
			finalItems = finalItems[:len(finalItems)-1]
		}

		if len(finalItems) > 0 {
			if cbErr := gq.builder.applyCallbacks(gq.ctx, finalItems); cbErr != nil {
				gq.addError(cbErr)
				return
			}
		}

		gq.result.Items = finalItems
	}
}

type BaseSubQuery interface {
	Count() (int64, error)
	TableName() string
	UnderlyingDB() *gorm.DB
}

type SubQuery interface {
	BaseSubQuery
	Scopes(...GormScope) SubQuery
}

type GenericSubQuery[T BaseSubQuery] struct {
	SubQuery BaseSubQuery
}

func (sq GenericSubQuery[T]) Count() (int64, error) {
	return sq.SubQuery.Count()
}

func (sq GenericSubQuery[T]) TableName() string {
	return sq.SubQuery.TableName()
}

func (sq GenericSubQuery[T]) UnderlyingDB() *gorm.DB {
	return sq.SubQuery.UnderlyingDB()
}

type scoper[T BaseSubQuery] interface {
	Scopes(funcs ...GormScope) T
}

func (sq GenericSubQuery[T]) Scopes(fns ...func(gen.Dao) gen.Dao) SubQuery {
	sq.SubQuery = sq.SubQuery.(scoper[T]).Scopes(fns...)
	return sq
}

type Scope = func(*gorm.DB) error

type GormScope = func(gen.Dao) gen.Dao

type DBContext interface {
	Query() *dao.Query
	TableName() string
	NewSubQuery(context.Context) SubQuery
}

type dbContext struct {
	q         *dao.Query
	tableName string
	factory   SubQueryFactory
}

func (db dbContext) Query() *dao.Query {
	return db.q
}

func (db dbContext) TableName() string {
	return db.tableName
}

func (db dbContext) NewSubQuery(ctx context.Context) SubQuery {
	return db.factory(ctx, db.q)
}

type CallbackContext interface {
	DBContext
	Lock()
	Unlock()
}

type callbackContext struct {
	dbContext
	*sync.Mutex
}

type Callback func(ctx context.Context, cbCtx CallbackContext, results any) error

type OrderByColumn struct {
	clause.OrderByColumn
	RequiredJoins []string
}

type OptionBuilder interface {
	DBContext
	Table(string) OptionBuilder
	Join(...TableJoin) OptionBuilder
	RequireJoin(...string) OptionBuilder
	QueryString(string) OptionBuilder
	Scope(...Scope) OptionBuilder
	Select(...clause.Expr) OptionBuilder
	OrderBy(...OrderByColumn) OptionBuilder
	Limit(uint) OptionBuilder
	Offset(uint) OptionBuilder
	Group(...clause.Column) OptionBuilder
	Facet(...Facet) OptionBuilder
	Preload(...field.RelationField) OptionBuilder
	Callback(...Callback) OptionBuilder
	Context(func(ctx context.Context) context.Context) OptionBuilder
	applySelect(db *gorm.DB, withOrderSelect bool) error
	applyPre(sq SubQuery, withOrderJoins bool) error
	applyPost(*gorm.DB) error
	createFacetsFilterCriteria() (Criteria, error)
	calculateAggregations(context.Context) (Aggregations, error)
	WithTotalCount(bool) OptionBuilder
	WithHasNextPage(bool) OptionBuilder
	WithAggregationBudget(float64) OptionBuilder
	AggregationBudget() float64
	withTotalCount() bool
	applyCallbacks(context.Context, any) error
	hasZeroLimit() bool
	needsNextPage() bool
	hasNextPage(nItems int) bool
	withCurrentFacet(string) OptionBuilder
	shouldTryCteStrategy() bool
	createContext(context.Context) context.Context
}

type optionBuilder struct {
	dbContext
	joins map[string]TableJoin
	//revive:disable-next-line:nested-structs
	requiredJoins     maps.InsertMap[string, struct{}]
	tsquery           string
	scopes            []Scope
	selections        []clause.Expr
	groupBy           []clause.Column
	orderBy           []OrderByColumn
	limit             model.NullUint
	nextPage          bool
	offset            uint
	facets            []Facet
	currentFacet      string
	preloads          []field.RelationField
	totalCount        bool
	aggregationBudget float64
	callbacks         []Callback
	contextFn         func(context.Context) context.Context
}

type RawJoin struct {
	Query string
	Args  []interface{}
}

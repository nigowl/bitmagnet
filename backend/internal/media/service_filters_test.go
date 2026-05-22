package media

import (
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestApplyMediaSearchFilterKeepsContentTypeIsolation(t *testing.T) {
	t.Parallel()

	db := newDryRunMediaDB(t)

	query := db.Table(model.TableNameMediaEntry+" me").
		Where("me.content_type = ?", model.ContentTypeTvShow)
	query = applyMediaSearchFilter(query, "死神")

	sql := query.Find(&[]model.MediaEntry{}).Statement.SQL.String()
	if !strings.Contains(sql, `WHERE me.content_type = $1 AND (`) {
		t.Fatalf("search filter should be grouped after content type filter, got SQL: %s", sql)
	}
	if !strings.Contains(sql, "OR me.name_original ILIKE") {
		t.Fatalf("search filter should include OR predicates, got SQL: %s", sql)
	}
	if strings.Contains(sql, "overview_zh") || strings.Contains(sql, "attributes") {
		t.Fatalf("short search filter should stay on primary fields, got SQL: %s", sql)
	}
}

func TestApplyMediaSearchFilterUsesTextExpressionForLongSearch(t *testing.T) {
	t.Parallel()

	db := newDryRunMediaDB(t)

	query := db.Table(model.TableNameMediaEntry+" me").
		Where("me.content_type = ?", model.ContentTypeTvShow)
	query = applyMediaSearchFilter(query, "剧场版")

	sql := query.Find(&[]model.MediaEntry{}).Statement.SQL.String()
	if !strings.Contains(sql, `WHERE me.content_type = $1 AND (`) {
		t.Fatalf("long search filter should be grouped after content type filter, got SQL: %s", sql)
	}
	if !strings.Contains(sql, "COALESCE(me.name_zh") || !strings.Contains(sql, "ILIKE") {
		t.Fatalf("long search filter should use the media search expression, got SQL: %s", sql)
	}
}

func TestListFiltersWithOrKeepContentTypeIsolation(t *testing.T) {
	t.Parallel()

	db := newDryRunMediaDB(t)

	qualityQuery := db.Table(model.TableNameMediaEntry+" me").
		Where("me.content_type = ?", model.ContentTypeMovie)
	qualityQuery = applyQualityFilter(qualityQuery, "dolby_vision")
	qualitySQL := qualityQuery.Find(&[]model.MediaEntry{}).Statement.SQL.String()
	if !strings.Contains(qualitySQL, `WHERE me.content_type = $1 AND (`) {
		t.Fatalf("quality filter should be grouped after content type filter, got SQL: %s", qualitySQL)
	}

	languageQuery := db.Table(model.TableNameMediaEntry+" me").
		Where("me.content_type = ?", model.ContentTypeTvShow)
	languageQuery = applyLanguageFilter(languageQuery, "japanese")
	languageSQL := languageQuery.Find(&[]model.MediaEntry{}).Statement.SQL.String()
	if !strings.Contains(languageSQL, `WHERE me.content_type = $1 AND (`) {
		t.Fatalf("language filter should be grouped after content type filter, got SQL: %s", languageSQL)
	}
}

func newDryRunMediaDB(t *testing.T) *gorm.DB {
	t.Helper()

	mockDB, _, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	t.Cleanup(func() {
		_ = mockDB.Close()
	})

	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 mockDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatalf("gorm.Open(): %v", err)
	}
	return db
}

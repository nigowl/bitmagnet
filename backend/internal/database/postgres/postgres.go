package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type Params struct {
	fx.In
	Config Config
	Logger *zap.SugaredLogger
}

type Result struct {
	fx.Out
	SQLDB   lazy.Lazy[*sql.DB]
	AppHook fx.Hook `group:"app_hooks"`
}

func New(p Params) (Result, error) {
	var db *sql.DB
	lazyDB := lazy.New(func() (*sql.DB, error) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		connConfig, configErr := pgx.ParseConfig(p.Config.CreateConnectionDSN())
		if configErr != nil {
			return nil, configErr
		}

		db = stdlib.OpenDB(*connConfig)
		applyPoolConfig(db, p.Config)

		if pingErr := waitForPing(ctx, p.Logger, db); pingErr != nil {
			_ = db.Close()
			db = nil
			return nil, pingErr
		}

		return db, nil
	})

	return Result{
		SQLDB: lazyDB,
		AppHook: fx.Hook{
			OnStop: func(context.Context) error {
				if db == nil {
					return nil
				}
				return db.Close()
			},
		},
	}, nil
}

func applyPoolConfig(db *sql.DB, cfg Config) {
	if cfg.PoolMaxConns > 0 {
		db.SetMaxOpenConns(int(cfg.PoolMaxConns))
	}
	if cfg.PoolMinConns > 0 {
		db.SetMaxIdleConns(int(cfg.PoolMinConns))
	}
	if cfg.PoolMaxConnLifetimeSeconds > 0 {
		db.SetConnMaxLifetime(time.Duration(cfg.PoolMaxConnLifetimeSeconds) * time.Second)
	}
	if cfg.PoolMaxConnIdleTimeSeconds > 0 {
		db.SetConnMaxIdleTime(time.Duration(cfg.PoolMaxConnIdleTimeSeconds) * time.Second)
	}
}

func waitForPing(ctx context.Context, logger *zap.SugaredLogger, db *sql.DB) error {
	i := 0

	var err error

	for {
		if ctx.Err() != nil {
			err = ctx.Err()
			break
		}

		err = db.PingContext(ctx)
		if err == nil {
			return nil
		}

		i++
		if i > 10 {
			break
		}
		select {
		case <-ctx.Done():
			break
		case <-time.After(time.Second):
			logger.Warnw("failed to ping database, retrying...", "error", err)
			break
		}
	}

	return fmt.Errorf("timed out waiting for ping: %w", err)
}

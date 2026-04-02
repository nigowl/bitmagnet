package server

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/queue"
	"github.com/nigowl/bitmagnet/internal/queue/handler"
	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type Params struct {
	fx.In
	Query lazy.Lazy[*dao.Query]
	// PgxPool  lazy.Lazy[*pgxpool.Pool]
	Handlers []lazy.Lazy[handler.Handler] `group:"queue_handlers"`
	Logger   *zap.SugaredLogger
}

type Result struct {
	fx.Out
	Worker worker.Worker `group:"workers"`
}

func New(p Params) Result {
	stopped := make(chan struct{})

	return Result{
		Worker: worker.NewWorker(
			"queue_server",
			fx.Hook{
				OnStart: func(context.Context) error {
					// pool, err := p.PgxPool.Get()
					// if err != nil {
					// 	return err
					// }
					query, err := p.Query.Get()
					if err != nil {
						return err
					}
					perf := queue.LoadPerformanceConfig(
						context.Background(),
						query.QueueJob.WithContext(context.Background()).UnderlyingDB(),
						queue.NewDefaultPerformanceConfig(),
					)
					handlers := make([]handler.Handler, 0, len(p.Handlers))
					for _, lh := range p.Handlers {
						h, err := lh.Get()
						if err != nil {
							return err
						}
						handlers = append(handlers, h)
					}
					srv := server{
						stopped: stopped,
						query:   query,
						// pool:       pool,
						handlers:                   handlers,
						cleanupHour:                2,
						cleanupCompletedMaxRecords: perf.CleanupCompletedMaxRecords,
						cleanupCompletedMaxAgeDays: perf.CleanupCompletedMaxAgeDays,
						logger:                     p.Logger.Named("queue"),
					}
					// todo: Fix!
					//nolint:contextcheck
					return srv.Start(context.Background())
				},
				OnStop: func(context.Context) error {
					close(stopped)
					return nil
				},
			},
		),
	}
}

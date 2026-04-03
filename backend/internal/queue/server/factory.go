package server

import (
	"context"
	"sync"
	"time"

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
	logger := p.Logger
	if logger == nil {
		logger = zap.NewNop().Sugar()
	}

	var (
		stateMu sync.Mutex
		stopped chan struct{}
		running bool
	)

	return Result{
		Worker: worker.NewWorker(
			"queue_server",
			fx.Hook{
				OnStart: func(context.Context) error {
					stateMu.Lock()
					if running {
						stateMu.Unlock()
						logger.Named("queue").Infow("queue server start skipped: already running")
						return nil
					}
					stopped = make(chan struct{})
					localStopped := stopped
					running = true
					stateMu.Unlock()

					startedAt := time.Now()
					logger.Named("queue").Infow("starting queue server worker")

					// pool, err := p.PgxPool.Get()
					// if err != nil {
					// 	return err
					// }
					query, err := p.Query.Get()
					if err != nil {
						stateMu.Lock()
						running = false
						stopped = nil
						stateMu.Unlock()
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
							stateMu.Lock()
							running = false
							stopped = nil
							stateMu.Unlock()
							return err
						}
						handlers = append(handlers, h)
					}
					srv := server{
						stopped: localStopped,
						query:   query,
						// pool:       pool,
						handlers:                   handlers,
						cleanupHour:                2,
						cleanupCompletedMaxRecords: perf.CleanupCompletedMaxRecords,
						cleanupCompletedMaxAgeDays: perf.CleanupCompletedMaxAgeDays,
						logger:                     logger.Named("queue"),
					}
					// todo: Fix!
					//nolint:contextcheck
					if err := srv.Start(context.Background()); err != nil {
						stateMu.Lock()
						running = false
						stopped = nil
						stateMu.Unlock()
						return err
					}
					logger.Named("queue").Infow(
						"queue server worker started",
						"elapsed", time.Since(startedAt),
						"handlers", len(handlers),
						"cleanup_hour", 2,
						"cleanup_max_records", perf.CleanupCompletedMaxRecords,
						"cleanup_max_age_days", perf.CleanupCompletedMaxAgeDays,
					)
					return nil
				},
				OnStop: func(context.Context) error {
					stateMu.Lock()
					if !running || stopped == nil {
						stateMu.Unlock()
						logger.Named("queue").Debugw("queue server stop skipped: already stopped")
						return nil
					}
					ch := stopped
					running = false
					stopped = nil
					stateMu.Unlock()

					close(ch)
					logger.Named("queue").Infow("queue server worker stop signal sent")
					return nil
				},
			},
		),
	}
}

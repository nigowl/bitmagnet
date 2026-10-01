package media

import (
	"context"
	"time"

	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type CoverCacheCleanupWorkerResult struct {
	fx.Out
	Worker worker.Worker `group:"workers"`
}

type CoverCacheCleanupWorkerParams struct {
	fx.In
	Service Service
	Logger  *zap.SugaredLogger
}

func NewCoverCacheCleanupWorker(p CoverCacheCleanupWorkerParams) CoverCacheCleanupWorkerResult {
	logger := p.Logger
	if logger == nil {
		logger = zap.NewNop().Sugar()
	}

	var cancel context.CancelFunc
	return CoverCacheCleanupWorkerResult{
		Worker: worker.NewWorker(
			"media_cover_cache_cleanup",
			fx.Hook{
				OnStart: func(context.Context) error {
					runContext, runCancel := context.WithCancel(context.Background())
					cancel = runCancel
					go runCoverCacheCleanupSchedule(runContext, p.Service, logger.Named("media_cover_cache_cleanup"))
					return nil
				},
				OnStop: func(context.Context) error {
					if cancel != nil {
						cancel()
					}
					return nil
				},
			},
		),
	}
}

func runCoverCacheCleanupSchedule(ctx context.Context, service Service, logger *zap.SugaredLogger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	lastRunDate := ""
	runIfDue := func(now time.Time) {
		date := now.Format("2006-01-02")
		if date == lastRunDate {
			return
		}
		result, ran, err := service.RunScheduledCoverCacheCleanup(ctx, now)
		if err != nil {
			logger.Errorw("cover cache cleanup failed", "error", err)
			return
		}
		if !ran {
			return
		}
		lastRunDate = date
		logger.Infow("cover cache cleanup scheduled run completed", "removed", result.Removed, "bytes", result.Bytes)
	}

	runIfDue(time.Now())
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			runIfDue(now)
		}
	}
}

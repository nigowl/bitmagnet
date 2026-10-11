package media

import (
	"context"
	"time"

	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type TopicsMaintenanceWorkerResult struct {
	fx.Out
	Worker worker.Worker `group:"workers"`
}

type TopicsMaintenanceWorkerParams struct {
	fx.In
	Service Service
	Logger  *zap.SugaredLogger
}

func NewTopicsMaintenanceWorker(p TopicsMaintenanceWorkerParams) TopicsMaintenanceWorkerResult {
	logger := p.Logger
	if logger == nil {
		logger = zap.NewNop().Sugar()
	}

	var cancel context.CancelFunc
	return TopicsMaintenanceWorkerResult{
		Worker: worker.NewWorker(
			"media_topics_maintenance",
			fx.Hook{
				OnStart: func(context.Context) error {
					runContext, runCancel := context.WithCancel(context.Background())
					cancel = runCancel
					go runTopicsMaintenanceSchedule(runContext, p.Service, logger.Named("media_topics_maintenance"))
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

func runTopicsMaintenanceSchedule(ctx context.Context, service Service, logger *zap.SugaredLogger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	lastRunDate := ""
	runIfDue := func(now time.Time) {
		date := now.Format("2006-01-02")
		if date == lastRunDate {
			return
		}
		result, err := service.RebuildTopics(ctx)
		if err != nil {
			logger.Errorw("topics maintenance failed", "error", err)
			return
		}
		lastRunDate = date
		logger.Infow("topics maintenance completed", "topics", result.TopicCount, "items", result.ItemCount)
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

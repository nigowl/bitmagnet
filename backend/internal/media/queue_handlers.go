package media

import (
	"context"
	"encoding/json"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
	"github.com/nigowl/bitmagnet/internal/queue/handler"
	"go.uber.org/fx"
)

type QueueHandlerParams struct {
	fx.In
	Service Service
	Dao     lazy.Lazy[*dao.Query]
}

type QueueHandlerResult struct {
	fx.Out
	Handler lazy.Lazy[handler.Handler] `group:"queue_handlers"`
}

func NewRefreshMetadataQueueHandler(p QueueHandlerParams) QueueHandlerResult {
	return QueueHandlerResult{
		Handler: lazy.New(func() (handler.Handler, error) {
			d, err := p.Dao.Get()
			if err != nil {
				return handler.Handler{}, err
			}
			perf := queue.LoadPerformanceConfig(
				context.Background(),
				d.QueueJob.WithContext(context.Background()).UnderlyingDB(),
				queue.NewDefaultPerformanceConfig(),
			)
			handlerConfig := perf.HandlerConfig(queue.QueueNameRefreshMediaMeta)
			return handler.New(
				queue.QueueNameRefreshMediaMeta,
				func(ctx context.Context, job model.QueueJob) error {
					msg := QueueTaskMessage{}
					if err := json.Unmarshal([]byte(job.Payload), &msg); err != nil {
						return err
					}
					_, err := p.Service.BackfillLocalizedMetadata(ctx, BackfillLocalizedInput{
						Limit: int(msg.Limit),
					})
					return err
				},
				handler.JobTimeout(handlerConfig.JobTimeout),
				handler.Concurrency(handlerConfig.Concurrency),
				handler.CheckInterval(handlerConfig.CheckInterval),
			), nil
		}),
	}
}

func NewBackfillCoverQueueHandler(p QueueHandlerParams) QueueHandlerResult {
	return QueueHandlerResult{
		Handler: lazy.New(func() (handler.Handler, error) {
			d, err := p.Dao.Get()
			if err != nil {
				return handler.Handler{}, err
			}
			perf := queue.LoadPerformanceConfig(
				context.Background(),
				d.QueueJob.WithContext(context.Background()).UnderlyingDB(),
				queue.NewDefaultPerformanceConfig(),
			)
			handlerConfig := perf.HandlerConfig(queue.QueueNameBackfillCoverCache)
			return handler.New(
				queue.QueueNameBackfillCoverCache,
				func(ctx context.Context, job model.QueueJob) error {
					msg := QueueTaskMessage{}
					if err := json.Unmarshal([]byte(job.Payload), &msg); err != nil {
						return err
					}
					_, err := p.Service.BackfillCoverCache(ctx, BackfillCoverCacheInput{
						Limit: int(msg.Limit),
					})
					return err
				},
				handler.JobTimeout(handlerConfig.JobTimeout),
				handler.Concurrency(handlerConfig.Concurrency),
				handler.CheckInterval(handlerConfig.CheckInterval),
			), nil
		}),
	}
}

package queue

import (
	"context"
	"encoding/json"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/processor"
	"github.com/nigowl/bitmagnet/internal/queue"
	"github.com/nigowl/bitmagnet/internal/queue/handler"
	"go.uber.org/fx"
)

type Params struct {
	fx.In
	Processor lazy.Lazy[processor.Processor]
	Dao       lazy.Lazy[*dao.Query]
}

type Result struct {
	fx.Out
	Handler lazy.Lazy[handler.Handler] `group:"queue_handlers"`
}

func New(p Params) Result {
	return Result{
		Handler: lazy.New(func() (handler.Handler, error) {
			pr, err := p.Processor.Get()
			if err != nil {
				return handler.Handler{}, err
			}
			d, err := p.Dao.Get()
			if err != nil {
				return handler.Handler{}, err
			}
			perf := queue.LoadPerformanceConfig(
				context.Background(),
				d.QueueJob.WithContext(context.Background()).UnderlyingDB(),
				queue.NewDefaultPerformanceConfig(),
			)
			handlerConfig := perf.HandlerConfig(queue.QueueNameProcessTorrent)
			return handler.New(
				processor.MessageName,
				func(ctx context.Context, job model.QueueJob) (err error) {
					msg := &processor.MessageParams{}
					if err := json.Unmarshal([]byte(job.Payload), msg); err != nil {
						return err
					}

					return pr.Process(ctx, *msg)
				},
				handler.JobTimeout(handlerConfig.JobTimeout),
				handler.Concurrency(handlerConfig.Concurrency),
				handler.CheckInterval(handlerConfig.CheckInterval),
			), nil
		}),
	}
}

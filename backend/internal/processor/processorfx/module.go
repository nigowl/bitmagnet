package processorfx

import (
	"github.com/nigowl/bitmagnet/internal/processor"
	batchqueue "github.com/nigowl/bitmagnet/internal/processor/batch/queue"
	processorqueue "github.com/nigowl/bitmagnet/internal/processor/queue"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"processor",
		fx.Provide(
			processor.New,
			processorqueue.New,
			batchqueue.New,
		),
	)
}

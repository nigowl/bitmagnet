package workerfx

import (
	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"worker",
		fx.Provide(worker.NewRegistry),
	)
}

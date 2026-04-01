package queuefx

import (
	"github.com/nigowl/bitmagnet/internal/queue/manager"
	"github.com/nigowl/bitmagnet/internal/queue/prometheus"
	"github.com/nigowl/bitmagnet/internal/queue/server"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"queue",
		fx.Provide(
			server.New,
			manager.New,
			prometheus.New,
		),
	)
}

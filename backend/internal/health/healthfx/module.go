package healthfx

import (
	"github.com/nigowl/bitmagnet/internal/health"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"health",
		fx.Provide(
			health.New,
		),
	)
}

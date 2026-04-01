package classifierfx

import (
	"github.com/nigowl/bitmagnet/internal/classifier"
	"github.com/nigowl/bitmagnet/internal/config/configfx"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"workflow",
		configfx.NewConfigModule[classifier.Config]("classifier", classifier.NewDefaultConfig()),
		fx.Provide(
			classifier.New,
		),
	)
}

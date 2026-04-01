package mediafx

import (
	"github.com/bitmagnet-io/bitmagnet/internal/config/configfx"
	"github.com/bitmagnet-io/bitmagnet/internal/media"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"media",
		configfx.NewConfigModule[media.Config]("media", media.NewDefaultConfig()),
		fx.Provide(
			media.NewService,
			media.NewHTTPServer,
		),
	)
}

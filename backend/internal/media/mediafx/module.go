package mediafx

import (
	"github.com/bitmagnet-io/bitmagnet/internal/config/configfx"
	"github.com/bitmagnet-io/bitmagnet/internal/media"
	mediaapi "github.com/bitmagnet-io/bitmagnet/internal/media/api"
	"github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins/sitepluginsfx"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"media",
		configfx.NewConfigModule[media.Config]("media", media.NewDefaultConfig()),
		sitepluginsfx.New(),
		fx.Provide(
			media.NewService,
			mediaapi.NewHTTPServer,
		),
	)
}

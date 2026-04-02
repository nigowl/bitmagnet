package mediafx

import (
	"github.com/nigowl/bitmagnet/internal/config/configfx"
	"github.com/nigowl/bitmagnet/internal/media"
	mediaapi "github.com/nigowl/bitmagnet/internal/media/api"
	"github.com/nigowl/bitmagnet/internal/media/siteplugins/sitepluginsfx"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"media",
		configfx.NewConfigModule[media.Config]("media", media.NewDefaultConfig()),
		sitepluginsfx.New(),
		fx.Provide(
			media.NewService,
			media.NewRefreshMetadataQueueHandler,
			media.NewBackfillCoverQueueHandler,
			mediaapi.NewHTTPServer,
		),
	)
}

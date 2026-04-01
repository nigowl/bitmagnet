package authfx

import (
	"github.com/bitmagnet-io/bitmagnet/internal/auth"
	"github.com/bitmagnet-io/bitmagnet/internal/config/configfx"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"auth",
		configfx.NewConfigModule[auth.Config]("auth", auth.NewDefaultConfig()),
		fx.Provide(
			auth.NewService,
			auth.NewHTTPServer,
		),
	)
}

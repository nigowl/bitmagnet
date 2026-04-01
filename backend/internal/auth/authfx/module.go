package authfx

import (
	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/nigowl/bitmagnet/internal/config/configfx"
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

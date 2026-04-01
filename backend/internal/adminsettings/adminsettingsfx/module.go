package adminsettingsfx

import (
	"context"

	"github.com/bitmagnet-io/bitmagnet/internal/adminsettings"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"admin_settings",
		fx.Provide(
			adminsettings.NewService,
			adminsettings.NewHTTPServer,
		),
		fx.Invoke(registerRuntimeSyncHook),
	)
}

type hookParams struct {
	fx.In
	Lifecycle fx.Lifecycle
	Service   adminsettings.Service
}

func registerRuntimeSyncHook(p hookParams) {
	p.Lifecycle.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			return p.Service.SyncRuntime(ctx)
		},
	})
}

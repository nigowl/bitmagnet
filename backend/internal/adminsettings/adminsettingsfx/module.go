package adminsettingsfx

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/adminsettings"
	"github.com/nigowl/bitmagnet/internal/worker"
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
		fx.Invoke(registerWorkerRegistry),
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

type workerRegistryParams struct {
	fx.In
	Service        adminsettings.Service
	WorkerRegistry worker.Registry `optional:"true"`
}

func registerWorkerRegistry(p workerRegistryParams) {
	if p.WorkerRegistry == nil {
		return
	}
	if binder, ok := p.Service.(interface{ SetWorkerRegistry(worker.Registry) }); ok {
		binder.SetWorkerRegistry(p.WorkerRegistry)
	}
}

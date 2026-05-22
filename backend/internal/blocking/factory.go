package blocking

import (
	"context"
	"time"

	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"go.uber.org/fx"
	"gorm.io/gorm"
)

type Params struct {
	fx.In
	GormDB lazy.Lazy[*gorm.DB]
}

type Result struct {
	fx.Out
	Manager lazy.Lazy[Manager]
	AppHook fx.Hook `group:"app_hooks"`
}

func New(params Params) Result {
	lazyManager := lazy.New[Manager](func() (Manager, error) {
		db, err := params.GormDB.Get()
		if err != nil {
			return nil, err
		}

		return &manager{
			db:            db,
			buffer:        make(map[protocol.ID]struct{}, 1000),
			maxBufferSize: 1000,
			maxFlushWait:  time.Minute * 5,
		}, nil
	})

	return Result{
		Manager: lazyManager,
		AppHook: fx.Hook{
			OnStop: func(ctx context.Context) error {
				return lazyManager.IfInitialized(func(m Manager) error {
					return m.Flush(ctx)
				})
			},
		},
	}
}

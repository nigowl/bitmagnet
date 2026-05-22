package healthcheck

import (
	"context"
	"fmt"
	"time"

	"github.com/nigowl/bitmagnet/internal/health"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"go.uber.org/fx"
	"gorm.io/gorm"
)

type Params struct {
	fx.In
	DB lazy.Lazy[*gorm.DB]
}

type Result struct {
	fx.Out
	Option health.CheckerOption `group:"health_check_options"`
}

func New(p Params) Result {
	return Result{
		Option: health.WithPeriodicCheck(
			time.Second*30,
			time.Second*1,
			health.Check{
				Name:    "postgres",
				Timeout: time.Second * 5,
				Check: func(ctx context.Context) error {
					db, dbErr := p.DB.Get()
					if dbErr != nil {
						return fmt.Errorf("failed to get database connection: %w", dbErr)
					}
					if err := db.WithContext(ctx).Exec("SELECT 1").Error; err != nil {
						return fmt.Errorf("failed to ping database: %w", err)
					}
					return nil
				},
			}),
	}
}

package databasefx

import (
	"github.com/nigowl/bitmagnet/internal/config/configfx"
	"github.com/nigowl/bitmagnet/internal/database"
	"github.com/nigowl/bitmagnet/internal/database/cache"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/healthcheck"
	"github.com/nigowl/bitmagnet/internal/database/migrations"
	"github.com/nigowl/bitmagnet/internal/database/postgres"
	"github.com/nigowl/bitmagnet/internal/database/search"
	"github.com/nigowl/bitmagnet/internal/model"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"database",
		configfx.NewConfigModule[postgres.Config]("postgres", postgres.NewDefaultConfig()),
		configfx.NewConfigModule[cache.Config]("gorm_cache", cache.NewDefaultConfig()),
		fx.Provide(
			cache.NewInMemoryCacher,
			cache.NewPlugin,
			dao.New,
			database.New,
			healthcheck.New,
			migrations.New,
			postgres.New,
			search.New,
		),
		fx.Decorate(
			cache.NewDecorator,
		),
		fx.Invoke(func(cfg postgres.Config) {
			model.ApplyTablePrefix(cfg.TablePrefix)
		}),
	)
}

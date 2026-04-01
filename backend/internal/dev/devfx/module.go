package devfx

import (
	"github.com/nigowl/bitmagnet/internal/app/cli"
	"github.com/nigowl/bitmagnet/internal/app/cli/args"
	"github.com/nigowl/bitmagnet/internal/config/configfx"
	"github.com/nigowl/bitmagnet/internal/database"
	"github.com/nigowl/bitmagnet/internal/database/migrations"
	"github.com/nigowl/bitmagnet/internal/database/postgres"
	"github.com/nigowl/bitmagnet/internal/dev/app/cmd/gormcmd"
	"github.com/nigowl/bitmagnet/internal/dev/app/cmd/migratecmd"
	"github.com/nigowl/bitmagnet/internal/logging/loggingfx"
	"github.com/nigowl/bitmagnet/internal/validation/validationfx"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"dev",
		configfx.NewConfigModule[postgres.Config]("postgres", postgres.NewDefaultConfig()),
		configfx.New(),
		loggingfx.New(),
		validationfx.New(),
		fx.Provide(args.New),
		fx.Provide(cli.New),
		fx.Provide(database.New),
		fx.Provide(migrations.New),
		fx.Provide(postgres.New),
		fx.Provide(gormcmd.New),
		fx.Provide(migratecmd.New),
	)
}

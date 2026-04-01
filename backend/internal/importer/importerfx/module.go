package importerfx

import (
	"github.com/nigowl/bitmagnet/internal/importer"
	"github.com/nigowl/bitmagnet/internal/importer/httpserver"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"importer",
		fx.Provide(
			httpserver.New,
			importer.New,
		),
	)
}

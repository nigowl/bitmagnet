package torznabfx

import (
	"github.com/nigowl/bitmagnet/internal/config/configfx"
	"github.com/nigowl/bitmagnet/internal/database/search"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/torznab"
	"github.com/nigowl/bitmagnet/internal/torznab/adapter"
	"github.com/nigowl/bitmagnet/internal/torznab/httpserver"
	"go.uber.org/fx"
)

func New() fx.Option {
	return fx.Module(
		"torznab",
		configfx.NewConfigModule[torznab.Config]("torznab", torznab.NewDefaultConfig()),
		fx.Provide(
			func(lazySearch lazy.Lazy[search.Search]) lazy.Lazy[torznab.Client] {
				return lazy.New[torznab.Client](func() (torznab.Client, error) {
					s, err := lazySearch.Get()
					if err != nil {
						return nil, err
					}

					return adapter.New(s), nil
				})
			},
			fx.Annotate(
				httpserver.New,
				fx.ResultTags(`group:"http_server_options"`),
			),
		),
		fx.Decorate(
			func(cfg torznab.Config) torznab.Config {
				return cfg.MergeDefaults()
			}),
	)
}

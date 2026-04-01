package sitepluginsfx

import (
	"github.com/bitmagnet-io/bitmagnet/internal/lazy"
	"github.com/bitmagnet-io/bitmagnet/internal/media"
	"github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins"
	"github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins/douban"
	"github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins/imdb"
	tmdbplugin "github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins/tmdb"
	tmdbapi "github.com/bitmagnet-io/bitmagnet/internal/tmdb"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

func New() fx.Option {
	return fx.Module(
		"media_site_plugins",
		fx.Provide(
			fx.Annotate(
				newTMDBPlugin,
				fx.As(new(siteplugins.Plugin)),
				fx.ResultTags(`group:"media_site_plugins"`),
			),
			fx.Annotate(
				newIMDbPlugin,
				fx.As(new(siteplugins.Plugin)),
				fx.ResultTags(`group:"media_site_plugins"`),
			),
			fx.Annotate(
				newDoubanPlugin,
				fx.ResultTags(`group:"media_site_plugins"`),
			),
		),
	)
}

func newTMDBPlugin(tmdbClient lazy.Lazy[tmdbapi.Client], logger *zap.Logger) siteplugins.Plugin {
	return tmdbplugin.NewWithDeps(tmdbClient, namedPluginLogger(logger, "tmdb"))
}

func newIMDbPlugin(logger *zap.Logger) siteplugins.Plugin {
	return imdb.NewWithLogger(namedPluginLogger(logger, "imdb"))
}

func newDoubanPlugin(cfg media.Config, logger *zap.Logger) siteplugins.Plugin {
	return douban.New(douban.Config{
		Enabled:        cfg.DoubanEnabled,
		SuggestURL:     cfg.DoubanSuggestURL,
		SearchURL:      cfg.DoubanSearchURL,
		MinScore:       cfg.DoubanMinScore,
		HTTPTimeout:    cfg.HTTPTimeout,
		Cookie:         cfg.DoubanCookie,
		UserAgent:      cfg.DoubanUserAgent,
		AcceptLanguage: cfg.DoubanAcceptLanguage,
		Referer:        cfg.DoubanReferer,
		Logger:         namedPluginLogger(logger, "douban"),
	})
}

func namedPluginLogger(logger *zap.Logger, plugin string) *zap.Logger {
	if logger == nil {
		return zap.NewNop()
	}
	return logger.Named("media_site_plugins").Named(plugin)
}

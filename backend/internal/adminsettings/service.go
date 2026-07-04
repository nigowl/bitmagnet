package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/nigowl/bitmagnet/internal/dhtcrawler"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/logging"
	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"github.com/nigowl/bitmagnet/internal/subtitles"
	"github.com/nigowl/bitmagnet/internal/tmdb"
	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

var ErrInvalidInput = errors.New("invalid input")
var ErrUnsupportedPlugin = errors.New("unsupported plugin")
var ErrWorkerRegistryUnavailable = errors.New("worker registry unavailable")
var ErrWorkerNotFound = errors.New("worker not found")

const (
	downloadMappingModeDirectory = "directory"
)

type mediaRuntimeCacheInvalidator interface {
	InvalidateRuntimeSettingsCache()
}

type Service interface {
	Get(ctx context.Context) (Settings, error)
	GetHome(ctx context.Context) (HomeSettings, error)
	GetRuntimeStatus(ctx context.Context) (RuntimeStatus, error)
	RestartWorker(ctx context.Context, key string) (worker.RestartReport, error)
	Update(ctx context.Context, input UpdateInput) (Settings, error)
	SyncRuntime(ctx context.Context) error
	TestPlugin(ctx context.Context, pluginKey string, input PluginTestInput) (PluginTestResult, error)
	TestPlayerTransmission(ctx context.Context, input TransmissionTestInput) (TransmissionTestResult, error)
	TestPlayerDownloadMapping(ctx context.Context, input DownloadMappingTestInput) (DownloadMappingTestResult, error)
	TestPlayerFFmpeg(ctx context.Context, input FFmpegTestInput) (FFmpegTestResult, error)
	ListPlayerTransmissionTasks(ctx context.Context) ([]TransmissionTask, error)
	GetPlayerTransmissionTaskStats(ctx context.Context) (TransmissionTaskStats, error)
	DeletePlayerTransmissionTask(ctx context.Context, input TransmissionTaskDeleteInput) (TransmissionTaskDeleteResult, error)
	RunPlayerTransmissionCleanup(ctx context.Context) (TransmissionCleanupResult, error)
	ListSubtitleTemplates(ctx context.Context) ([]subtitles.Template, error)
	CreateSubtitleTemplate(ctx context.Context, input subtitles.Input) (subtitles.Template, error)
	UpdateSubtitleTemplate(ctx context.Context, id string, input subtitles.Input) (subtitles.Template, error)
	DeleteSubtitleTemplate(ctx context.Context, id string) error
	BackfillLocalizedMetadata(ctx context.Context, limit int) (media.BackfillLocalizedResult, error)
	StartMaintenanceTask(ctx context.Context, input MaintenanceTaskInput) (MaintenanceTask, error)
	GetMaintenanceStats(ctx context.Context, taskType string) (MaintenanceStats, error)
	GetMaintenanceTask(ctx context.Context, taskID string) (MaintenanceTask, error)
}

type Params struct {
	fx.In
	DB               lazy.Lazy[*gorm.DB]
	LogConfig        logging.Config
	AuthConfig       auth.Config
	MediaConfig      media.Config
	DHTCrawlerConfig dhtcrawler.Config
	MediaService     media.Service
	TMDBClient       lazy.Lazy[tmdb.Client]
	LevelController  logging.LevelController `optional:"true"`
	Logger           *zap.Logger             `optional:"true"`
}

func NewService(p Params) Service {
	defaultLogLevel, err := logging.NormalizeLevel(p.LogConfig.Level)
	if err != nil {
		defaultLogLevel = "INFO"
	}

	return &service{
		db:              p.DB,
		levelController: p.LevelController,
		defaults:        newSettingsDefaults(p, defaultLogLevel),
		mediaConfig:     p.MediaConfig,
		mediaService:    p.MediaService,
		tmdbClient:      p.TMDBClient,
		logger:          namedLogger(p.Logger, "media_site_plugins.settings"),
	}
}

type service struct {
	db              lazy.Lazy[*gorm.DB]
	levelController logging.LevelController
	workerRegistry  worker.Registry
	defaults        Settings
	mediaConfig     media.Config
	mediaService    media.Service
	tmdbClient      lazy.Lazy[tmdb.Client]
	logger          *zap.Logger
}

func (s *service) SetWorkerRegistry(registry worker.Registry) {
	s.workerRegistry = registry
}

func (s *service) Get(ctx context.Context) (Settings, error) {
	db, err := s.db.Get()
	if err != nil {
		return Settings{}, err
	}

	values, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return Settings{}, err
	}

	return s.merge(values), nil
}

func (s *service) GetHome(ctx context.Context) (HomeSettings, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return HomeSettings{}, err
	}
	return settings.Home, nil
}

func (s *service) SyncRuntime(ctx context.Context) error {
	if s.levelController == nil {
		return nil
	}
	settings, err := s.Get(ctx)
	if err != nil {
		return err
	}
	return s.levelController.SetLevel(settings.LogLevel)
}

func (s *service) Update(ctx context.Context, input UpdateInput) (Settings, error) {
	db, err := s.db.Get()
	if err != nil {
		return Settings{}, err
	}

	effective := s.defaults
	currentValues, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return Settings{}, err
	}
	effective = s.merge(currentValues)

	updates := make(map[string]*string)

	if input.LogLevel != nil {
		trimmed := strings.TrimSpace(*input.LogLevel)
		if trimmed == "" {
			updates[runtimeconfig.KeySystemLogLevel] = nil
			effective.LogLevel = s.defaults.LogLevel
		} else {
			normalized, normalizeErr := logging.NormalizeLevel(trimmed)
			if normalizeErr != nil {
				return Settings{}, fmt.Errorf("%w: logLevel", ErrInvalidInput)
			}
			updates[runtimeconfig.KeySystemLogLevel] = ptr(normalized)
			effective.LogLevel = normalized
		}
	}

	applyOptionalBoolUpdate(input.TMDBEnabled, runtimeconfig.KeyMediaTMDBEnabled, updates, func(value bool) {
		effective.TMDBEnabled = value
	})
	applyOptionalBoolUpdate(input.IMDbEnabled, runtimeconfig.KeyMediaIMDbEnabled, updates, func(value bool) {
		effective.IMDbEnabled = value
	})
	applyOptionalBoolUpdate(input.DoubanEnabled, runtimeconfig.KeyMediaDoubanEnabled, updates, func(value bool) {
		effective.DoubanEnabled = value
	})
	if input.DoubanMinScore != nil {
		if err := applyOptionalFloatUpdate(
			input.DoubanMinScore, runtimeconfig.KeyMediaDoubanMinScore, "doubanMinScore", updates,
			func(value float64) bool { return value >= 0 && value <= 1 },
			func(value float64) { effective.DoubanMinScore = value },
		); err != nil {
			return Settings{}, err
		}
	}
	applyOptionalTrimmedStringUpdate(input.DoubanCookie, runtimeconfig.KeyMediaDoubanCookie, s.defaults.DoubanCookie, updates, func(value string) {
		effective.DoubanCookie = value
	})
	applyOptionalTrimmedStringUpdate(input.DoubanUserAgent, runtimeconfig.KeyMediaDoubanUserAgent, s.defaults.DoubanUserAgent, updates, func(value string) {
		effective.DoubanUserAgent = value
	})
	applyOptionalTrimmedStringUpdate(input.DoubanAcceptLanguage, runtimeconfig.KeyMediaDoubanAcceptLanguage, s.defaults.DoubanAcceptLanguage, updates, func(value string) {
		effective.DoubanAcceptLanguage = value
	})
	applyOptionalTrimmedStringUpdate(input.DoubanReferer, runtimeconfig.KeyMediaDoubanReferer, s.defaults.DoubanReferer, updates, func(value string) {
		effective.DoubanReferer = value
	})

	if input.Performance != nil {
		if dht := input.Performance.DHT; dht != nil {
			if err := applyOptionalUintUpdate(
				dht.ScalingFactor, 1, 200, runtimeconfig.KeyDHTCrawlerScalingFactor,
				"performance.dht.scalingFactor", updates,
				func(value uint) { effective.Performance.DHT.ScalingFactor = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalIntUpdate(
				dht.ReseedIntervalSeconds, 10, 3600, runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds,
				"performance.dht.reseedIntervalSeconds", updates,
				func(value int) { effective.Performance.DHT.ReseedIntervalSeconds = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalUintUpdate(
				dht.SaveFilesThreshold, 1, 20000, runtimeconfig.KeyDHTCrawlerSaveFilesThreshold,
				"performance.dht.saveFilesThreshold", updates,
				func(value uint) { effective.Performance.DHT.SaveFilesThreshold = value },
			); err != nil {
				return Settings{}, err
			}
			applyOptionalBoolUpdate(dht.SavePieces, runtimeconfig.KeyDHTCrawlerSavePieces, updates, func(value bool) {
				effective.Performance.DHT.SavePieces = value
			})
			if err := applyOptionalIntUpdate(
				dht.RescrapeThresholdHours, 1, 24*365, runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours,
				"performance.dht.rescrapeThresholdHours", updates,
				func(value int) { effective.Performance.DHT.RescrapeThresholdHours = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalIntUpdate(
				dht.StatusLogIntervalSeconds, 5, 3600, runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds,
				"performance.dht.statusLogIntervalSeconds", updates,
				func(value int) { effective.Performance.DHT.StatusLogIntervalSeconds = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalIntUpdate(
				dht.GetOldestNodesIntervalSeconds, 1, 600, runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds,
				"performance.dht.getOldestNodesIntervalSeconds", updates,
				func(value int) { effective.Performance.DHT.GetOldestNodesIntervalSeconds = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalIntUpdate(
				dht.OldPeerThresholdMinutes, 1, 24*60, runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes,
				"performance.dht.oldPeerThresholdMinutes", updates,
				func(value int) { effective.Performance.DHT.OldPeerThresholdMinutes = value },
			); err != nil {
				return Settings{}, err
			}
			applyOptionalBoolUpdate(dht.ScheduleEnabled, runtimeconfig.KeyDHTCrawlerScheduleEnabled, updates, func(value bool) {
				effective.Performance.DHT.ScheduleEnabled = value
			})
			if dht.ScheduleWeekdays != nil {
				weekdays, err := normalizeDHTScheduleWeekdays(*dht.ScheduleWeekdays)
				if err != nil {
					return Settings{}, fmt.Errorf("%w: performance.dht.scheduleWeekdays", ErrInvalidInput)
				}
				value := joinInts(weekdays)
				updates[runtimeconfig.KeyDHTCrawlerScheduleWeekdays] = &value
				effective.Performance.DHT.ScheduleWeekdays = weekdays
			}
			if err := applyOptionalIntUpdate(
				dht.ScheduleStartHour, 0, 23, runtimeconfig.KeyDHTCrawlerScheduleStartHour,
				"performance.dht.scheduleStartHour", updates,
				func(value int) { effective.Performance.DHT.ScheduleStartHour = value },
			); err != nil {
				return Settings{}, err
			}
			if err := applyOptionalIntUpdate(
				dht.ScheduleEndHour, 1, 24, runtimeconfig.KeyDHTCrawlerScheduleEndHour,
				"performance.dht.scheduleEndHour", updates,
				func(value int) { effective.Performance.DHT.ScheduleEndHour = value },
			); err != nil {
				return Settings{}, err
			}
			if err := validateDHTSchedule(effective.Performance.DHT); err != nil {
				return Settings{}, err
			}
		}

		if q := input.Performance.Queue; q != nil {
			if err := applyQueuePerformanceUpdate(q, &effective, updates); err != nil {
				return Settings{}, err
			}
		}
		if m := input.Performance.Media; m != nil {
			if err := applyMediaPerformanceUpdate(m, &effective, updates); err != nil {
				return Settings{}, err
			}
		}
	}

	if input.Home != nil {
		if err := applyHomeUpdate(input.Home, &effective, updates); err != nil {
			return Settings{}, err
		}
	}
	if input.Player != nil {
		if err := applyPlayerUpdate(input.Player, &effective, updates, s.defaults.Player); err != nil {
			return Settings{}, err
		}
	}
	if input.Auth != nil {
		if err := applyAuthUpdate(input.Auth, &effective, updates); err != nil {
			return Settings{}, err
		}
	}

	if len(updates) == 0 {
		return effective, nil
	}

	if err := runtimeconfig.WriteValues(ctx, db, updates); err != nil {
		return Settings{}, err
	}

	if input.LogLevel != nil && s.levelController != nil {
		if err := s.levelController.SetLevel(effective.LogLevel); err != nil {
			return Settings{}, err
		}
	}

	if invalidator, ok := s.mediaService.(mediaRuntimeCacheInvalidator); ok &&
		hasUpdateWithAnyPrefix(updates, "system.media.", "system.performance.media.", "system.home.hot.") {
		invalidator.InvalidateRuntimeSettingsCache()
	}

	if _, ok := updates[runtimeconfig.KeyHomeHotDays]; ok {
		if err := media.RefreshRecentHeatWindow(ctx, db, effective.Home.Hot.Days); err != nil {
			return Settings{}, err
		}
	}

	if s.workerRegistry != nil {
		restartTargets := make([]string, 0, 2)
		if hasUpdateWithPrefix(updates, "system.performance.dht.") {
			restartTargets = append(restartTargets, "dht_crawler")
		}
		if hasUpdateWithPrefix(updates, "system.performance.queue.") {
			restartTargets = append(restartTargets, "queue_server")
		}
		if len(restartTargets) > 0 {
			if err := s.workerRegistry.Restart(ctx, restartTargets...); err != nil {
				return Settings{}, err
			}
		}
	}

	latestValues, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return Settings{}, err
	}
	return s.merge(latestValues), nil
}

func namedLogger(logger *zap.Logger, name string) *zap.Logger {
	if logger == nil {
		return zap.NewNop()
	}
	return logger.Named(name)
}

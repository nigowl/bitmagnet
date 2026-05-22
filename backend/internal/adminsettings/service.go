package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"strconv"
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

	if input.TMDBEnabled != nil {
		value := strconv.FormatBool(*input.TMDBEnabled)
		updates[runtimeconfig.KeyMediaTMDBEnabled] = &value
		effective.TMDBEnabled = *input.TMDBEnabled
	}
	if input.IMDbEnabled != nil {
		value := strconv.FormatBool(*input.IMDbEnabled)
		updates[runtimeconfig.KeyMediaIMDbEnabled] = &value
		effective.IMDbEnabled = *input.IMDbEnabled
	}
	if input.DoubanEnabled != nil {
		value := strconv.FormatBool(*input.DoubanEnabled)
		updates[runtimeconfig.KeyMediaDoubanEnabled] = &value
		effective.DoubanEnabled = *input.DoubanEnabled
	}
	if input.DoubanMinScore != nil {
		if *input.DoubanMinScore < 0 || *input.DoubanMinScore > 1 {
			return Settings{}, fmt.Errorf("%w: doubanMinScore", ErrInvalidInput)
		}
		value := strconv.FormatFloat(*input.DoubanMinScore, 'f', 4, 64)
		updates[runtimeconfig.KeyMediaDoubanMinScore] = &value
		effective.DoubanMinScore = *input.DoubanMinScore
	}
	if input.DoubanCookie != nil {
		trimmed := strings.TrimSpace(*input.DoubanCookie)
		if trimmed == "" {
			updates[runtimeconfig.KeyMediaDoubanCookie] = nil
			effective.DoubanCookie = s.defaults.DoubanCookie
		} else {
			updates[runtimeconfig.KeyMediaDoubanCookie] = &trimmed
			effective.DoubanCookie = trimmed
		}
	}
	if input.DoubanUserAgent != nil {
		trimmed := strings.TrimSpace(*input.DoubanUserAgent)
		if trimmed == "" {
			updates[runtimeconfig.KeyMediaDoubanUserAgent] = nil
			effective.DoubanUserAgent = s.defaults.DoubanUserAgent
		} else {
			updates[runtimeconfig.KeyMediaDoubanUserAgent] = &trimmed
			effective.DoubanUserAgent = trimmed
		}
	}
	if input.DoubanAcceptLanguage != nil {
		trimmed := strings.TrimSpace(*input.DoubanAcceptLanguage)
		if trimmed == "" {
			updates[runtimeconfig.KeyMediaDoubanAcceptLanguage] = nil
			effective.DoubanAcceptLanguage = s.defaults.DoubanAcceptLanguage
		} else {
			updates[runtimeconfig.KeyMediaDoubanAcceptLanguage] = &trimmed
			effective.DoubanAcceptLanguage = trimmed
		}
	}
	if input.DoubanReferer != nil {
		trimmed := strings.TrimSpace(*input.DoubanReferer)
		if trimmed == "" {
			updates[runtimeconfig.KeyMediaDoubanReferer] = nil
			effective.DoubanReferer = s.defaults.DoubanReferer
		} else {
			updates[runtimeconfig.KeyMediaDoubanReferer] = &trimmed
			effective.DoubanReferer = trimmed
		}
	}

	if input.Performance != nil {
		if dht := input.Performance.DHT; dht != nil {
			if dht.ScalingFactor != nil {
				if *dht.ScalingFactor < 1 || *dht.ScalingFactor > 200 {
					return Settings{}, fmt.Errorf("%w: performance.dht.scalingFactor", ErrInvalidInput)
				}
				value := strconv.FormatUint(uint64(*dht.ScalingFactor), 10)
				updates[runtimeconfig.KeyDHTCrawlerScalingFactor] = &value
				effective.Performance.DHT.ScalingFactor = *dht.ScalingFactor
			}
			if dht.ReseedIntervalSeconds != nil {
				if *dht.ReseedIntervalSeconds < 10 || *dht.ReseedIntervalSeconds > 3600 {
					return Settings{}, fmt.Errorf("%w: performance.dht.reseedIntervalSeconds", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.ReseedIntervalSeconds)
				updates[runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds] = &value
				effective.Performance.DHT.ReseedIntervalSeconds = *dht.ReseedIntervalSeconds
			}
			if dht.SaveFilesThreshold != nil {
				if *dht.SaveFilesThreshold < 1 || *dht.SaveFilesThreshold > 20000 {
					return Settings{}, fmt.Errorf("%w: performance.dht.saveFilesThreshold", ErrInvalidInput)
				}
				value := strconv.FormatUint(uint64(*dht.SaveFilesThreshold), 10)
				updates[runtimeconfig.KeyDHTCrawlerSaveFilesThreshold] = &value
				effective.Performance.DHT.SaveFilesThreshold = *dht.SaveFilesThreshold
			}
			if dht.SavePieces != nil {
				value := strconv.FormatBool(*dht.SavePieces)
				updates[runtimeconfig.KeyDHTCrawlerSavePieces] = &value
				effective.Performance.DHT.SavePieces = *dht.SavePieces
			}
			if dht.RescrapeThresholdHours != nil {
				if *dht.RescrapeThresholdHours < 1 || *dht.RescrapeThresholdHours > 24*365 {
					return Settings{}, fmt.Errorf("%w: performance.dht.rescrapeThresholdHours", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.RescrapeThresholdHours)
				updates[runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours] = &value
				effective.Performance.DHT.RescrapeThresholdHours = *dht.RescrapeThresholdHours
			}
			if dht.StatusLogIntervalSeconds != nil {
				if *dht.StatusLogIntervalSeconds < 5 || *dht.StatusLogIntervalSeconds > 3600 {
					return Settings{}, fmt.Errorf("%w: performance.dht.statusLogIntervalSeconds", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.StatusLogIntervalSeconds)
				updates[runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds] = &value
				effective.Performance.DHT.StatusLogIntervalSeconds = *dht.StatusLogIntervalSeconds
			}
			if dht.GetOldestNodesIntervalSeconds != nil {
				if *dht.GetOldestNodesIntervalSeconds < 1 || *dht.GetOldestNodesIntervalSeconds > 600 {
					return Settings{}, fmt.Errorf("%w: performance.dht.getOldestNodesIntervalSeconds", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.GetOldestNodesIntervalSeconds)
				updates[runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds] = &value
				effective.Performance.DHT.GetOldestNodesIntervalSeconds = *dht.GetOldestNodesIntervalSeconds
			}
			if dht.OldPeerThresholdMinutes != nil {
				if *dht.OldPeerThresholdMinutes < 1 || *dht.OldPeerThresholdMinutes > 24*60 {
					return Settings{}, fmt.Errorf("%w: performance.dht.oldPeerThresholdMinutes", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.OldPeerThresholdMinutes)
				updates[runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes] = &value
				effective.Performance.DHT.OldPeerThresholdMinutes = *dht.OldPeerThresholdMinutes
			}
			if dht.ScheduleEnabled != nil {
				value := strconv.FormatBool(*dht.ScheduleEnabled)
				updates[runtimeconfig.KeyDHTCrawlerScheduleEnabled] = &value
				effective.Performance.DHT.ScheduleEnabled = *dht.ScheduleEnabled
			}
			if dht.ScheduleWeekdays != nil {
				weekdays, err := normalizeDHTScheduleWeekdays(*dht.ScheduleWeekdays)
				if err != nil {
					return Settings{}, fmt.Errorf("%w: performance.dht.scheduleWeekdays", ErrInvalidInput)
				}
				value := joinInts(weekdays)
				updates[runtimeconfig.KeyDHTCrawlerScheduleWeekdays] = &value
				effective.Performance.DHT.ScheduleWeekdays = weekdays
			}
			if dht.ScheduleStartHour != nil {
				if *dht.ScheduleStartHour < 0 || *dht.ScheduleStartHour > 23 {
					return Settings{}, fmt.Errorf("%w: performance.dht.scheduleStartHour", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.ScheduleStartHour)
				updates[runtimeconfig.KeyDHTCrawlerScheduleStartHour] = &value
				effective.Performance.DHT.ScheduleStartHour = *dht.ScheduleStartHour
			}
			if dht.ScheduleEndHour != nil {
				if *dht.ScheduleEndHour < 1 || *dht.ScheduleEndHour > 24 {
					return Settings{}, fmt.Errorf("%w: performance.dht.scheduleEndHour", ErrInvalidInput)
				}
				value := strconv.Itoa(*dht.ScheduleEndHour)
				updates[runtimeconfig.KeyDHTCrawlerScheduleEndHour] = &value
				effective.Performance.DHT.ScheduleEndHour = *dht.ScheduleEndHour
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

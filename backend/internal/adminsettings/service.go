package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/dhtcrawler"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/logging"
	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"github.com/nigowl/bitmagnet/internal/subtitles"
	"github.com/nigowl/bitmagnet/internal/tmdb"
	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrInvalidInput = errors.New("invalid input")
var ErrUnsupportedPlugin = errors.New("unsupported plugin")

type mediaRuntimeCacheInvalidator interface {
	InvalidateRuntimeSettingsCache()
}

type Settings struct {
	LogLevel             string              `json:"logLevel"`
	TMDBEnabled          bool                `json:"tmdbEnabled"`
	IMDbEnabled          bool                `json:"imdbEnabled"`
	DoubanEnabled        bool                `json:"doubanEnabled"`
	DoubanMinScore       float64             `json:"doubanMinScore"`
	DoubanCookie         string              `json:"doubanCookie"`
	DoubanUserAgent      string              `json:"doubanUserAgent"`
	DoubanAcceptLanguage string              `json:"doubanAcceptLanguage"`
	DoubanReferer        string              `json:"doubanReferer"`
	Performance          PerformanceSettings `json:"performance"`
}

type PerformanceSettings struct {
	DHT   DHTPerformanceSettings   `json:"dht"`
	Queue QueuePerformanceSettings `json:"queue"`
	Media MediaPerformanceSettings `json:"media"`
}

type DHTPerformanceSettings struct {
	ScalingFactor                 uint `json:"scalingFactor"`
	ReseedIntervalSeconds         int  `json:"reseedIntervalSeconds"`
	SaveFilesThreshold            uint `json:"saveFilesThreshold"`
	SavePieces                    bool `json:"savePieces"`
	RescrapeThresholdHours        int  `json:"rescrapeThresholdHours"`
	StatusLogIntervalSeconds      int  `json:"statusLogIntervalSeconds"`
	GetOldestNodesIntervalSeconds int  `json:"getOldestNodesIntervalSeconds"`
	OldPeerThresholdMinutes       int  `json:"oldPeerThresholdMinutes"`
}

type QueuePerformanceSettings struct {
	ProcessTorrentConcurrency                int `json:"processTorrentConcurrency"`
	ProcessTorrentCheckIntervalSeconds       int `json:"processTorrentCheckIntervalSeconds"`
	ProcessTorrentTimeoutSeconds             int `json:"processTorrentTimeoutSeconds"`
	ProcessTorrentBatchConcurrency           int `json:"processTorrentBatchConcurrency"`
	ProcessTorrentBatchCheckIntervalSeconds  int `json:"processTorrentBatchCheckIntervalSeconds"`
	ProcessTorrentBatchTimeoutSeconds        int `json:"processTorrentBatchTimeoutSeconds"`
	RefreshMediaMetadataConcurrency          int `json:"refreshMediaMetadataConcurrency"`
	RefreshMediaMetadataCheckIntervalSeconds int `json:"refreshMediaMetadataCheckIntervalSeconds"`
	RefreshMediaMetadataTimeoutSeconds       int `json:"refreshMediaMetadataTimeoutSeconds"`
	BackfillCoverCacheConcurrency            int `json:"backfillCoverCacheConcurrency"`
	BackfillCoverCacheCheckIntervalSeconds   int `json:"backfillCoverCacheCheckIntervalSeconds"`
	BackfillCoverCacheTimeoutSeconds         int `json:"backfillCoverCacheTimeoutSeconds"`
	CleanupCompletedMaxRecords               int `json:"cleanupCompletedMaxRecords"`
	CleanupCompletedMaxAgeDays               int `json:"cleanupCompletedMaxAgeDays"`
}

type MediaPerformanceSettings struct {
	AutoCacheCover     bool `json:"autoCacheCover"`
	AutoFetchBilingual bool `json:"autoFetchBilingual"`
}

type UpdateInput struct {
	LogLevel             *string                   `json:"logLevel"`
	TMDBEnabled          *bool                     `json:"tmdbEnabled"`
	IMDbEnabled          *bool                     `json:"imdbEnabled"`
	DoubanEnabled        *bool                     `json:"doubanEnabled"`
	DoubanMinScore       *float64                  `json:"doubanMinScore"`
	DoubanCookie         *string                   `json:"doubanCookie"`
	DoubanUserAgent      *string                   `json:"doubanUserAgent"`
	DoubanAcceptLanguage *string                   `json:"doubanAcceptLanguage"`
	DoubanReferer        *string                   `json:"doubanReferer"`
	Performance          *PerformanceSettingsInput `json:"performance"`
}

type PerformanceSettingsInput struct {
	DHT   *DHTPerformanceSettingsInput   `json:"dht"`
	Queue *QueuePerformanceSettingsInput `json:"queue"`
	Media *MediaPerformanceSettingsInput `json:"media"`
}

type DHTPerformanceSettingsInput struct {
	ScalingFactor                 *uint `json:"scalingFactor"`
	ReseedIntervalSeconds         *int  `json:"reseedIntervalSeconds"`
	SaveFilesThreshold            *uint `json:"saveFilesThreshold"`
	SavePieces                    *bool `json:"savePieces"`
	RescrapeThresholdHours        *int  `json:"rescrapeThresholdHours"`
	StatusLogIntervalSeconds      *int  `json:"statusLogIntervalSeconds"`
	GetOldestNodesIntervalSeconds *int  `json:"getOldestNodesIntervalSeconds"`
	OldPeerThresholdMinutes       *int  `json:"oldPeerThresholdMinutes"`
}

type QueuePerformanceSettingsInput struct {
	ProcessTorrentConcurrency                *int `json:"processTorrentConcurrency"`
	ProcessTorrentCheckIntervalSeconds       *int `json:"processTorrentCheckIntervalSeconds"`
	ProcessTorrentTimeoutSeconds             *int `json:"processTorrentTimeoutSeconds"`
	ProcessTorrentBatchConcurrency           *int `json:"processTorrentBatchConcurrency"`
	ProcessTorrentBatchCheckIntervalSeconds  *int `json:"processTorrentBatchCheckIntervalSeconds"`
	ProcessTorrentBatchTimeoutSeconds        *int `json:"processTorrentBatchTimeoutSeconds"`
	RefreshMediaMetadataConcurrency          *int `json:"refreshMediaMetadataConcurrency"`
	RefreshMediaMetadataCheckIntervalSeconds *int `json:"refreshMediaMetadataCheckIntervalSeconds"`
	RefreshMediaMetadataTimeoutSeconds       *int `json:"refreshMediaMetadataTimeoutSeconds"`
	BackfillCoverCacheConcurrency            *int `json:"backfillCoverCacheConcurrency"`
	BackfillCoverCacheCheckIntervalSeconds   *int `json:"backfillCoverCacheCheckIntervalSeconds"`
	BackfillCoverCacheTimeoutSeconds         *int `json:"backfillCoverCacheTimeoutSeconds"`
	CleanupCompletedMaxRecords               *int `json:"cleanupCompletedMaxRecords"`
	CleanupCompletedMaxAgeDays               *int `json:"cleanupCompletedMaxAgeDays"`
}

type MediaPerformanceSettingsInput struct {
	AutoCacheCover     *bool `json:"autoCacheCover"`
	AutoFetchBilingual *bool `json:"autoFetchBilingual"`
}

type RuntimeStatus struct {
	CheckedAt time.Time              `json:"checkedAt"`
	Settings  []RuntimeSettingStatus `json:"settings"`
	Workers   []WorkerRuntimeStatus  `json:"workers"`
}

type RuntimeSettingStatus struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Source string `json:"source"`
}

type WorkerRuntimeStatus struct {
	Key     string `json:"key"`
	Enabled bool   `json:"enabled"`
	Started bool   `json:"started"`
}

type Service interface {
	Get(ctx context.Context) (Settings, error)
	GetRuntimeStatus(ctx context.Context) (RuntimeStatus, error)
	Update(ctx context.Context, input UpdateInput) (Settings, error)
	SyncRuntime(ctx context.Context) error
	TestPlugin(ctx context.Context, pluginKey string, input PluginTestInput) (PluginTestResult, error)
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

	defaults := Settings{
		LogLevel:             defaultLogLevel,
		TMDBEnabled:          p.MediaConfig.TMDBEnabled,
		IMDbEnabled:          p.MediaConfig.IMDbEnabled,
		DoubanEnabled:        p.MediaConfig.DoubanEnabled,
		DoubanMinScore:       p.MediaConfig.DoubanMinScore,
		DoubanCookie:         p.MediaConfig.DoubanCookie,
		DoubanUserAgent:      p.MediaConfig.DoubanUserAgent,
		DoubanAcceptLanguage: p.MediaConfig.DoubanAcceptLanguage,
		DoubanReferer:        p.MediaConfig.DoubanReferer,
		Performance: PerformanceSettings{
			DHT: DHTPerformanceSettings{
				ScalingFactor:                 p.DHTCrawlerConfig.ScalingFactor,
				ReseedIntervalSeconds:         int(p.DHTCrawlerConfig.ReseedBootstrapNodesInterval / time.Second),
				SaveFilesThreshold:            p.DHTCrawlerConfig.SaveFilesThreshold,
				SavePieces:                    p.DHTCrawlerConfig.SavePieces,
				RescrapeThresholdHours:        int(p.DHTCrawlerConfig.RescrapeThreshold / time.Hour),
				StatusLogIntervalSeconds:      int(p.DHTCrawlerConfig.StatusLogInterval / time.Second),
				GetOldestNodesIntervalSeconds: int(p.DHTCrawlerConfig.GetOldestNodesInterval / time.Second),
				OldPeerThresholdMinutes:       int(p.DHTCrawlerConfig.OldPeerThreshold / time.Minute),
			},
			Queue: newQueuePerformanceSettingsDefaults(queue.NewDefaultPerformanceConfig()),
			Media: MediaPerformanceSettings{
				AutoCacheCover:     true,
				AutoFetchBilingual: true,
			},
		},
	}

	return &service{
		db:              p.DB,
		levelController: p.LevelController,
		defaults:        defaults,
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

func (s *service) GetRuntimeStatus(ctx context.Context) (RuntimeStatus, error) {
	db, err := s.db.Get()
	if err != nil {
		return RuntimeStatus{}, err
	}

	runtimeValues, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return RuntimeStatus{}, err
	}

	merged := s.merge(runtimeValues)
	effectiveMap := settingsToRuntimeValueMap(merged)
	keys := append([]string(nil), runtimeconfig.AdminEditableKeys()...)
	sort.Strings(keys)

	settings := make([]RuntimeSettingStatus, 0, len(keys))
	for _, key := range keys {
		source := "default"
		if _, ok := runtimeValues[key]; ok {
			source = "runtime"
		}
		settings = append(settings, RuntimeSettingStatus{
			Key:    key,
			Value:  effectiveMap[key],
			Source: source,
		})
	}

	workers := make([]WorkerRuntimeStatus, 0, 4)
	if s.workerRegistry != nil {
		for _, w := range s.workerRegistry.Workers() {
			workers = append(workers, WorkerRuntimeStatus{
				Key:     w.Key(),
				Enabled: w.Enabled(),
				Started: w.Started(),
			})
		}
	}

	return RuntimeStatus{
		CheckedAt: time.Now(),
		Settings:  settings,
		Workers:   workers,
	}, nil
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
		}

		if q := input.Performance.Queue; q != nil {
			if err := applyQueuePerformanceUpdate(q, &effective, updates); err != nil {
				return Settings{}, err
			}
		}
		if m := input.Performance.Media; m != nil {
			applyMediaPerformanceUpdate(m, &effective, updates)
		}
	}

	if len(updates) == 0 {
		return effective, nil
	}

	now := time.Now()
	for key, valuePtr := range updates {
		if valuePtr == nil {
			if err := db.WithContext(ctx).
				Table(model.TableNameKeyValue).
				Where("key = ?", key).
				Delete(&model.KeyValue{}).Error; err != nil {
				return Settings{}, err
			}
			continue
		}

		item := model.KeyValue{
			Key:       key,
			Value:     *valuePtr,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := db.WithContext(ctx).
			Table(model.TableNameKeyValue).
			Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "key"}},
				DoUpdates: clause.Assignments(map[string]any{
					"value":      item.Value,
					"updated_at": now,
				}),
			}).
			Create(&item).Error; err != nil {
			return Settings{}, err
		}
	}

	if input.LogLevel != nil && s.levelController != nil {
		if err := s.levelController.SetLevel(effective.LogLevel); err != nil {
			return Settings{}, err
		}
	}

	if invalidator, ok := s.mediaService.(mediaRuntimeCacheInvalidator); ok &&
		hasUpdateWithAnyPrefix(updates, "system.media.", "system.performance.media.") {
		invalidator.InvalidateRuntimeSettingsCache()
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

func (s *service) BackfillLocalizedMetadata(ctx context.Context, limit int) (media.BackfillLocalizedResult, error) {
	if s.mediaService == nil {
		return media.BackfillLocalizedResult{}, errors.New("media service not available")
	}

	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	return s.mediaService.BackfillLocalizedMetadata(ctx, media.BackfillLocalizedInput{Limit: limit})
}

func (s *service) ListSubtitleTemplates(ctx context.Context) ([]subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}
	return subtitles.Load(ctx, db)
}

func (s *service) CreateSubtitleTemplate(ctx context.Context, input subtitles.Input) (subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return subtitles.Template{}, err
	}
	return subtitles.Create(ctx, db, input)
}

func (s *service) UpdateSubtitleTemplate(ctx context.Context, id string, input subtitles.Input) (subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return subtitles.Template{}, err
	}
	return subtitles.Update(ctx, db, id, input)
}

func (s *service) DeleteSubtitleTemplate(ctx context.Context, id string) error {
	db, err := s.db.Get()
	if err != nil {
		return err
	}
	return subtitles.Delete(ctx, db, id)
}

func (s *service) merge(values map[string]string) Settings {
	result := s.defaults

	if level, ok := values[runtimeconfig.KeySystemLogLevel]; ok {
		if normalized, err := logging.NormalizeLevel(level); err == nil {
			result.LogLevel = normalized
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaTMDBEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.TMDBEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaIMDbEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.IMDbEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.DoubanEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanMinScore]; ok {
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(raw), 64); err == nil && parsed >= 0 && parsed <= 1 {
			result.DoubanMinScore = parsed
		}
	}
	if value, ok := values[runtimeconfig.KeyMediaDoubanCookie]; ok {
		result.DoubanCookie = strings.TrimSpace(value)
	}
	if value, ok := values[runtimeconfig.KeyMediaDoubanUserAgent]; ok {
		result.DoubanUserAgent = strings.TrimSpace(value)
	}
	if value, ok := values[runtimeconfig.KeyMediaDoubanAcceptLanguage]; ok {
		result.DoubanAcceptLanguage = strings.TrimSpace(value)
	}
	if value, ok := values[runtimeconfig.KeyMediaDoubanReferer]; ok {
		result.DoubanReferer = strings.TrimSpace(value)
	}
	applyDHTPerformanceMerge(&result, values)
	applyQueuePerformanceMerge(&result, values)
	applyMediaPerformanceMerge(&result, values)

	return result
}

func ptr(value string) *string {
	return &value
}

func applyQueuePerformanceUpdate(
	input *QueuePerformanceSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	setInt := func(field *int, min, max int, key string, setter func(v int), label string) error {
		if field == nil {
			return nil
		}
		if *field < min || *field > max {
			return fmt.Errorf("%w: %s", ErrInvalidInput, label)
		}
		value := strconv.Itoa(*field)
		updates[key] = &value
		setter(*field)
		return nil
	}

	if err := setInt(
		input.ProcessTorrentConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentConcurrency,
		func(v int) { effective.Performance.Queue.ProcessTorrentConcurrency = v },
		"performance.queue.processTorrentConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v },
		"performance.queue.processTorrentCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentTimeoutSeconds = v },
		"performance.queue.processTorrentTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentBatchConcurrency,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchConcurrency = v },
		"performance.queue.processTorrentBatchConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v },
		"performance.queue.processTorrentBatchCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v },
		"performance.queue.processTorrentBatchTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataConcurrency, 1, 128, runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataConcurrency = v },
		"performance.queue.refreshMediaMetadataConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v },
		"performance.queue.refreshMediaMetadataCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v },
		"performance.queue.refreshMediaMetadataTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheConcurrency, 1, 128, runtimeconfig.KeyQueueBackfillCoverCacheConcurrency,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheConcurrency = v },
		"performance.queue.backfillCoverCacheConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v },
		"performance.queue.backfillCoverCacheCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v },
		"performance.queue.backfillCoverCacheTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.CleanupCompletedMaxRecords, 100, 1000000, runtimeconfig.KeyQueueCleanupCompletedMaxRecords,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxRecords = v },
		"performance.queue.cleanupCompletedMaxRecords",
	); err != nil {
		return err
	}
	if err := setInt(
		input.CleanupCompletedMaxAgeDays, 1, 3650, runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxAgeDays = v },
		"performance.queue.cleanupCompletedMaxAgeDays",
	); err != nil {
		return err
	}

	return nil
}

func applyMediaPerformanceUpdate(
	input *MediaPerformanceSettingsInput,
	effective *Settings,
	updates map[string]*string,
) {
	if input.AutoCacheCover != nil {
		value := strconv.FormatBool(*input.AutoCacheCover)
		updates[runtimeconfig.KeyMediaAutoCacheCover] = &value
		effective.Performance.Media.AutoCacheCover = *input.AutoCacheCover
	}

	if input.AutoFetchBilingual != nil {
		value := strconv.FormatBool(*input.AutoFetchBilingual)
		updates[runtimeconfig.KeyMediaAutoFetchBilingual] = &value
		effective.Performance.Media.AutoFetchBilingual = *input.AutoFetchBilingual
	}
}

func applyDHTPerformanceMerge(result *Settings, values map[string]string) {
	applyInt := func(key string, min, max int, setter func(v int)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.Atoi(strings.TrimSpace(raw))
		if err != nil || parsed < min || parsed > max {
			return
		}
		setter(parsed)
	}
	applyBool := func(key string, setter func(v bool)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
		if err != nil {
			return
		}
		setter(parsed)
	}

	applyInt(runtimeconfig.KeyDHTCrawlerScalingFactor, 1, 200, func(v int) {
		result.Performance.DHT.ScalingFactor = uint(v)
	})
	applyInt(runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds, 10, 3600, func(v int) {
		result.Performance.DHT.ReseedIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerSaveFilesThreshold, 1, 20000, func(v int) {
		result.Performance.DHT.SaveFilesThreshold = uint(v)
	})
	applyBool(runtimeconfig.KeyDHTCrawlerSavePieces, func(v bool) {
		result.Performance.DHT.SavePieces = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours, 1, 24*365, func(v int) {
		result.Performance.DHT.RescrapeThresholdHours = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds, 5, 3600, func(v int) {
		result.Performance.DHT.StatusLogIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds, 1, 600, func(v int) {
		result.Performance.DHT.GetOldestNodesIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes, 1, 24*60, func(v int) {
		result.Performance.DHT.OldPeerThresholdMinutes = v
	})
}

func applyQueuePerformanceMerge(result *Settings, values map[string]string) {
	applyInt := func(key string, min, max int, setter func(v int)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.Atoi(strings.TrimSpace(raw))
		if err != nil || parsed < min || parsed > max {
			return
		}
		setter(parsed)
	}

	applyInt(runtimeconfig.KeyQueueProcessTorrentConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.ProcessTorrentConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.BackfillCoverCacheConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueCleanupCompletedMaxRecords, 100, 1000000, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxRecords = v
	})
	applyInt(runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays, 1, 3650, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxAgeDays = v
	})
}

func applyMediaPerformanceMerge(result *Settings, values map[string]string) {
	applyBool := func(key string, setter func(v bool)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
		if err != nil {
			return
		}
		setter(parsed)
	}

	applyBool(runtimeconfig.KeyMediaAutoCacheCover, func(v bool) {
		result.Performance.Media.AutoCacheCover = v
	})
	applyBool(runtimeconfig.KeyMediaAutoFetchBilingual, func(v bool) {
		result.Performance.Media.AutoFetchBilingual = v
	})
}

func hasUpdateWithPrefix(updates map[string]*string, prefix string) bool {
	for key := range updates {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func hasUpdateWithAnyPrefix(updates map[string]*string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if hasUpdateWithPrefix(updates, prefix) {
			return true
		}
	}
	return false
}

func newQueuePerformanceSettingsDefaults(cfg queue.PerformanceConfig) QueuePerformanceSettings {
	return QueuePerformanceSettings{
		ProcessTorrentConcurrency:                cfg.ProcessTorrentConcurrency,
		ProcessTorrentCheckIntervalSeconds:       int(cfg.ProcessTorrentCheckInterval / time.Second),
		ProcessTorrentTimeoutSeconds:             int(cfg.ProcessTorrentTimeout / time.Second),
		ProcessTorrentBatchConcurrency:           cfg.ProcessTorrentBatchConcurrency,
		ProcessTorrentBatchCheckIntervalSeconds:  int(cfg.ProcessTorrentBatchCheckIntvl / time.Second),
		ProcessTorrentBatchTimeoutSeconds:        int(cfg.ProcessTorrentBatchTimeout / time.Second),
		RefreshMediaMetadataConcurrency:          cfg.RefreshMediaMetaConcurrency,
		RefreshMediaMetadataCheckIntervalSeconds: int(cfg.RefreshMediaMetaCheckInterval / time.Second),
		RefreshMediaMetadataTimeoutSeconds:       int(cfg.RefreshMediaMetaTimeout / time.Second),
		BackfillCoverCacheConcurrency:            cfg.BackfillCoverConcurrency,
		BackfillCoverCacheCheckIntervalSeconds:   int(cfg.BackfillCoverCheckInterval / time.Second),
		BackfillCoverCacheTimeoutSeconds:         int(cfg.BackfillCoverTimeout / time.Second),
		CleanupCompletedMaxRecords:               cfg.CleanupCompletedMaxRecords,
		CleanupCompletedMaxAgeDays:               cfg.CleanupCompletedMaxAgeDays,
	}
}

func settingsToRuntimeValueMap(settings Settings) map[string]string {
	return map[string]string{
		runtimeconfig.KeySystemLogLevel: settings.LogLevel,

		runtimeconfig.KeyMediaTMDBEnabled: strconv.FormatBool(settings.TMDBEnabled),
		runtimeconfig.KeyMediaIMDbEnabled: strconv.FormatBool(settings.IMDbEnabled),

		runtimeconfig.KeyMediaDoubanEnabled:        strconv.FormatBool(settings.DoubanEnabled),
		runtimeconfig.KeyMediaDoubanMinScore:       strconv.FormatFloat(settings.DoubanMinScore, 'f', 4, 64),
		runtimeconfig.KeyMediaDoubanCookie:         settings.DoubanCookie,
		runtimeconfig.KeyMediaDoubanUserAgent:      settings.DoubanUserAgent,
		runtimeconfig.KeyMediaDoubanAcceptLanguage: settings.DoubanAcceptLanguage,
		runtimeconfig.KeyMediaDoubanReferer:        settings.DoubanReferer,

		runtimeconfig.KeyDHTCrawlerScalingFactor:                 strconv.FormatUint(uint64(settings.Performance.DHT.ScalingFactor), 10),
		runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds:         strconv.Itoa(settings.Performance.DHT.ReseedIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerSaveFilesThreshold:            strconv.FormatUint(uint64(settings.Performance.DHT.SaveFilesThreshold), 10),
		runtimeconfig.KeyDHTCrawlerSavePieces:                    strconv.FormatBool(settings.Performance.DHT.SavePieces),
		runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours:        strconv.Itoa(settings.Performance.DHT.RescrapeThresholdHours),
		runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds:      strconv.Itoa(settings.Performance.DHT.StatusLogIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds: strconv.Itoa(settings.Performance.DHT.GetOldestNodesIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes:       strconv.Itoa(settings.Performance.DHT.OldPeerThresholdMinutes),

		runtimeconfig.KeyQueueProcessTorrentConcurrency:                strconv.Itoa(settings.Performance.Queue.ProcessTorrentConcurrency),
		runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds:       strconv.Itoa(settings.Performance.Queue.ProcessTorrentCheckIntervalSeconds),
		runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds:             strconv.Itoa(settings.Performance.Queue.ProcessTorrentTimeoutSeconds),
		runtimeconfig.KeyQueueProcessTorrentBatchConcurrency:           strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchConcurrency),
		runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds:  strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds),
		runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds:        strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchTimeoutSeconds),
		runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency:          strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataConcurrency),
		runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds: strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds),
		runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds:       strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataTimeoutSeconds),
		runtimeconfig.KeyQueueBackfillCoverCacheConcurrency:            strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheConcurrency),
		runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds:   strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds),
		runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds:         strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheTimeoutSeconds),
		runtimeconfig.KeyQueueCleanupCompletedMaxRecords:               strconv.Itoa(settings.Performance.Queue.CleanupCompletedMaxRecords),
		runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays:               strconv.Itoa(settings.Performance.Queue.CleanupCompletedMaxAgeDays),

		runtimeconfig.KeyMediaAutoCacheCover:     strconv.FormatBool(settings.Performance.Media.AutoCacheCover),
		runtimeconfig.KeyMediaAutoFetchBilingual: strconv.FormatBool(settings.Performance.Media.AutoFetchBilingual),
	}
}

func namedLogger(logger *zap.Logger, name string) *zap.Logger {
	if logger == nil {
		return zap.NewNop()
	}
	return logger.Named(name)
}

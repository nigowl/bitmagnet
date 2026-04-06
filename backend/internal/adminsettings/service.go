package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/nigowl/bitmagnet/internal/dhtcrawler"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/logging"
	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/queue"
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
	Home                 HomeSettings        `json:"home"`
	Player               PlayerSettings      `json:"player"`
	Auth                 AuthSettings        `json:"auth"`
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
	AutoCacheCover       bool `json:"autoCacheCover"`
	AutoFetchBilingual   bool `json:"autoFetchBilingual"`
	WarmupTimeoutSeconds int  `json:"warmupTimeoutSeconds"`
}

type HomeSettings struct {
	Daily     HomeDailySettings     `json:"daily"`
	HighScore HomeHighScoreSettings `json:"highScore"`
}

type HomeDailySettings struct {
	RefreshHour int `json:"refreshHour"`
	PoolLimit   int `json:"poolLimit"`
}

type HomeHighScoreSettings struct {
	PoolLimit int     `json:"poolLimit"`
	MinScore  float64 `json:"minScore"`
	MaxScore  float64 `json:"maxScore"`
	Window    float64 `json:"window"`
}

type PlayerSettings struct {
	Enabled                bool                 `json:"enabled"`
	MetadataTimeoutSeconds int                  `json:"metadataTimeoutSeconds"`
	HardTimeoutSeconds     int                  `json:"hardTimeoutSeconds"`
	Transmission           TransmissionSettings `json:"transmission"`
	FFmpeg                 FFmpegSettings       `json:"ffmpeg"`
}

type TransmissionSettings struct {
	Enabled                      bool   `json:"enabled"`
	URL                          string `json:"url"`
	LocalDownloadDir             string `json:"localDownloadDir"`
	DownloadMappingDirectory     string `json:"downloadMappingDirectory"`
	Username                     string `json:"username"`
	Password                     string `json:"password"`
	InsecureTLS                  bool   `json:"insecureTls"`
	TimeoutSeconds               int    `json:"timeoutSeconds"`
	SequentialDownload           bool   `json:"sequentialDownload"`
	AutoCleanupEnabled           bool   `json:"autoCleanupEnabled"`
	AutoCleanupSlowTaskEnabled   bool   `json:"autoCleanupSlowTaskEnabled"`
	AutoCleanupStorageEnabled    bool   `json:"autoCleanupStorageEnabled"`
	AutoCleanupMaxTasks          int    `json:"autoCleanupMaxTasks"`
	AutoCleanupMaxTotalSizeGB    int    `json:"autoCleanupMaxTotalSizeGB"`
	AutoCleanupMinFreeSpaceGB    int    `json:"autoCleanupMinFreeSpaceGB"`
	AutoCleanupSlowWindowMinutes int    `json:"autoCleanupSlowWindowMinutes"`
	AutoCleanupSlowRateKbps      int    `json:"autoCleanupSlowRateKbps"`
}

type FFmpegSettings struct {
	Enabled                  bool   `json:"enabled"`
	BinaryPath               string `json:"binaryPath"`
	Preset                   string `json:"preset"`
	CRF                      int    `json:"crf"`
	AudioBitrateKbps         int    `json:"audioBitrateKbps"`
	Threads                  int    `json:"threads"`
	ExtraArgs                string `json:"extraArgs"`
	ForceTranscodeExtensions string `json:"forceTranscodeExtensions"`
}

type AuthSettings struct {
	MembershipEnabled   bool `json:"membershipEnabled"`
	RegistrationEnabled bool `json:"registrationEnabled"`
	InviteRequired      bool `json:"inviteRequired"`
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
	Home                 *HomeSettingsInput        `json:"home"`
	Player               *PlayerSettingsInput      `json:"player"`
	Auth                 *AuthSettingsInput        `json:"auth"`
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
	AutoCacheCover       *bool `json:"autoCacheCover"`
	AutoFetchBilingual   *bool `json:"autoFetchBilingual"`
	WarmupTimeoutSeconds *int  `json:"warmupTimeoutSeconds"`
}

type HomeSettingsInput struct {
	Daily     *HomeDailySettingsInput     `json:"daily"`
	HighScore *HomeHighScoreSettingsInput `json:"highScore"`
}

type HomeDailySettingsInput struct {
	RefreshHour *int `json:"refreshHour"`
	PoolLimit   *int `json:"poolLimit"`
}

type HomeHighScoreSettingsInput struct {
	PoolLimit *int     `json:"poolLimit"`
	MinScore  *float64 `json:"minScore"`
	MaxScore  *float64 `json:"maxScore"`
	Window    *float64 `json:"window"`
}

type PlayerSettingsInput struct {
	Enabled                *bool                      `json:"enabled"`
	MetadataTimeoutSeconds *int                       `json:"metadataTimeoutSeconds"`
	HardTimeoutSeconds     *int                       `json:"hardTimeoutSeconds"`
	Transmission           *TransmissionSettingsInput `json:"transmission"`
	FFmpeg                 *FFmpegSettingsInput       `json:"ffmpeg"`
}

type TransmissionSettingsInput struct {
	Enabled                      *bool   `json:"enabled"`
	URL                          *string `json:"url"`
	LocalDownloadDir             *string `json:"localDownloadDir"`
	DownloadMappingDirectory     *string `json:"downloadMappingDirectory"`
	Username                     *string `json:"username"`
	Password                     *string `json:"password"`
	InsecureTLS                  *bool   `json:"insecureTls"`
	TimeoutSeconds               *int    `json:"timeoutSeconds"`
	SequentialDownload           *bool   `json:"sequentialDownload"`
	AutoCleanupEnabled           *bool   `json:"autoCleanupEnabled"`
	AutoCleanupSlowTaskEnabled   *bool   `json:"autoCleanupSlowTaskEnabled"`
	AutoCleanupStorageEnabled    *bool   `json:"autoCleanupStorageEnabled"`
	AutoCleanupMaxTasks          *int    `json:"autoCleanupMaxTasks"`
	AutoCleanupMaxTotalSizeGB    *int    `json:"autoCleanupMaxTotalSizeGB"`
	AutoCleanupMinFreeSpaceGB    *int    `json:"autoCleanupMinFreeSpaceGB"`
	AutoCleanupSlowWindowMinutes *int    `json:"autoCleanupSlowWindowMinutes"`
	AutoCleanupSlowRateKbps      *int    `json:"autoCleanupSlowRateKbps"`
}

type TransmissionTask struct {
	ID             int64   `json:"id"`
	HashString     string  `json:"hashString"`
	Name           string  `json:"name"`
	Status         int     `json:"status"`
	PercentDone    float64 `json:"percentDone"`
	RateDownload   int64   `json:"rateDownload"`
	RateUpload     int64   `json:"rateUpload"`
	LeftUntilDone  int64   `json:"leftUntilDone"`
	SizeWhenDone   int64   `json:"sizeWhenDone"`
	AddedAtUnix    int64   `json:"addedAtUnix"`
	ActivityAtUnix int64   `json:"activityAtUnix"`
	IsFinished     bool    `json:"isFinished"`
	DownloadDir    string  `json:"downloadDir"`
	ErrorString    string  `json:"errorString"`
}

type TransmissionTaskDeleteInput struct {
	ID int64 `json:"id"`
}

type TransmissionTaskDeleteResult struct {
	Success bool  `json:"success"`
	ID      int64 `json:"id"`
}

type TransmissionCleanupResult struct {
	Success           bool     `json:"success"`
	TotalBefore       int      `json:"totalBefore"`
	RemovedCount      int      `json:"removedCount"`
	RemovedIDs        []int64  `json:"removedIds"`
	Reasons           []string `json:"reasons"`
	EstimatedFreeGain int64    `json:"estimatedFreeGain"`
}

type TransmissionTaskStats struct {
	TaskCount          int   `json:"taskCount"`
	TotalSizeBytes     int64 `json:"totalSizeBytes"`
	FreeSpaceBytes     int64 `json:"freeSpaceBytes"`
	FreeSpaceAvailable bool  `json:"freeSpaceAvailable"`
}

type FFmpegSettingsInput struct {
	Enabled                  *bool   `json:"enabled"`
	BinaryPath               *string `json:"binaryPath"`
	Preset                   *string `json:"preset"`
	CRF                      *int    `json:"crf"`
	AudioBitrateKbps         *int    `json:"audioBitrateKbps"`
	Threads                  *int    `json:"threads"`
	ExtraArgs                *string `json:"extraArgs"`
	ForceTranscodeExtensions *string `json:"forceTranscodeExtensions"`
}

type AuthSettingsInput struct {
	MembershipEnabled   *bool `json:"membershipEnabled"`
	RegistrationEnabled *bool `json:"registrationEnabled"`
	InviteRequired      *bool `json:"inviteRequired"`
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
				AutoCacheCover:       true,
				AutoFetchBilingual:   true,
				WarmupTimeoutSeconds: 90,
			},
		},
		Home: HomeSettings{
			Daily: HomeDailySettings{
				RefreshHour: 2,
				PoolLimit:   96,
			},
			HighScore: HomeHighScoreSettings{
				PoolLimit: 120,
				MinScore:  8.0,
				MaxScore:  9.9,
				Window:    1.0,
			},
		},
		Player: PlayerSettings{
			Enabled:                true,
			MetadataTimeoutSeconds: 25,
			HardTimeoutSeconds:     45,
			Transmission: TransmissionSettings{
				Enabled:                      false,
				URL:                          "http://127.0.0.1:9091/transmission/rpc",
				LocalDownloadDir:             "",
				DownloadMappingDirectory:     "",
				Username:                     "",
				Password:                     "",
				InsecureTLS:                  false,
				TimeoutSeconds:               8,
				SequentialDownload:           true,
				AutoCleanupEnabled:           false,
				AutoCleanupSlowTaskEnabled:   true,
				AutoCleanupStorageEnabled:    true,
				AutoCleanupMaxTasks:          60,
				AutoCleanupMaxTotalSizeGB:    100,
				AutoCleanupMinFreeSpaceGB:    20,
				AutoCleanupSlowWindowMinutes: 30,
				AutoCleanupSlowRateKbps:      100,
			},
			FFmpeg: FFmpegSettings{
				Enabled:                  false,
				BinaryPath:               "ffmpeg",
				Preset:                   "veryfast",
				CRF:                      23,
				AudioBitrateKbps:         128,
				Threads:                  0,
				ExtraArgs:                "",
				ForceTranscodeExtensions: ".mkv,.avi,.flv,.wmv,.rm,.rmvb,.ts,.m2ts,.mpeg,.mpg,.vob,.mxf,.divx,.xvid,.3gp,.3g2,.f4v",
			},
		},
		Auth: AuthSettings{
			MembershipEnabled:   false,
			RegistrationEnabled: p.AuthConfig.AllowRegistration,
			InviteRequired:      false,
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

func (s *service) GetHome(ctx context.Context) (HomeSettings, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return HomeSettings{}, err
	}
	return settings.Home, nil
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

func (s *service) RestartWorker(ctx context.Context, key string) (worker.RestartReport, error) {
	if s.workerRegistry == nil {
		return worker.RestartReport{}, ErrWorkerRegistryUnavailable
	}

	workerKey := strings.TrimSpace(key)
	if workerKey == "" {
		return worker.RestartReport{}, fmt.Errorf("%w: workerKey", ErrInvalidInput)
	}

	found := false
	for _, w := range s.workerRegistry.Workers() {
		if w.Key() == workerKey {
			found = true
			break
		}
	}
	if !found {
		return worker.RestartReport{}, fmt.Errorf("%w: %s", ErrWorkerNotFound, workerKey)
	}

	restartStartedAt := time.Now()
	s.logger.Info("admin worker restart requested", zap.String("worker_key", workerKey))

	report, err := s.workerRegistry.RestartWithReport(ctx, workerKey)
	if err != nil {
		s.logger.Error(
			"admin worker restart failed",
			zap.String("worker_key", workerKey),
			zap.Error(err),
			zap.Duration("elapsed", time.Since(restartStartedAt)),
		)
		return report, err
	}
	s.logger.Info(
		"admin worker restart succeeded",
		zap.String("worker_key", workerKey),
		zap.Duration("elapsed", time.Since(restartStartedAt)),
	)
	return report, nil
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
	applyHomeMerge(&result, values)
	applyPlayerMerge(&result, values)
	applyAuthMerge(&result, values)

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
) error {
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

	if input.WarmupTimeoutSeconds != nil {
		if *input.WarmupTimeoutSeconds < 5 || *input.WarmupTimeoutSeconds > 7200 {
			return fmt.Errorf("%w: performance.media.warmupTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.WarmupTimeoutSeconds)
		updates[runtimeconfig.KeyMediaWarmupTimeoutSeconds] = &value
		effective.Performance.Media.WarmupTimeoutSeconds = *input.WarmupTimeoutSeconds
	}

	return nil
}

func applyHomeUpdate(
	input *HomeSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	if input == nil {
		return nil
	}

	if daily := input.Daily; daily != nil {
		if daily.RefreshHour != nil {
			if *daily.RefreshHour < 0 || *daily.RefreshHour > 23 {
				return fmt.Errorf("%w: home.daily.refreshHour", ErrInvalidInput)
			}
			value := strconv.Itoa(*daily.RefreshHour)
			updates[runtimeconfig.KeyHomeDailyRefreshHour] = &value
			effective.Home.Daily.RefreshHour = *daily.RefreshHour
		}
		if daily.PoolLimit != nil {
			if *daily.PoolLimit < 24 || *daily.PoolLimit > 240 {
				return fmt.Errorf("%w: home.daily.poolLimit", ErrInvalidInput)
			}
			value := strconv.Itoa(*daily.PoolLimit)
			updates[runtimeconfig.KeyHomeDailyPoolLimit] = &value
			effective.Home.Daily.PoolLimit = *daily.PoolLimit
		}
	}

	if high := input.HighScore; high != nil {
		if high.PoolLimit != nil {
			if *high.PoolLimit < 24 || *high.PoolLimit > 240 {
				return fmt.Errorf("%w: home.highScore.poolLimit", ErrInvalidInput)
			}
			value := strconv.Itoa(*high.PoolLimit)
			updates[runtimeconfig.KeyHomeHighScorePoolLimit] = &value
			effective.Home.HighScore.PoolLimit = *high.PoolLimit
		}
		if high.MinScore != nil {
			if *high.MinScore < 0 || *high.MinScore > 10 {
				return fmt.Errorf("%w: home.highScore.minScore", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.MinScore, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreMin] = &value
			effective.Home.HighScore.MinScore = *high.MinScore
		}
		if high.MaxScore != nil {
			if *high.MaxScore < 0 || *high.MaxScore > 10 {
				return fmt.Errorf("%w: home.highScore.maxScore", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.MaxScore, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreMax] = &value
			effective.Home.HighScore.MaxScore = *high.MaxScore
		}
		if high.Window != nil {
			if *high.Window <= 0 || *high.Window > 10 {
				return fmt.Errorf("%w: home.highScore.window", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.Window, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreWindow] = &value
			effective.Home.HighScore.Window = *high.Window
		}
	}

	if effective.Home.HighScore.MinScore > effective.Home.HighScore.MaxScore {
		return fmt.Errorf("%w: home.highScore.minScore", ErrInvalidInput)
	}

	return nil
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
	applyInt(runtimeconfig.KeyMediaWarmupTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Media.WarmupTimeoutSeconds = v
	})
}

func applyHomeMerge(result *Settings, values map[string]string) {
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
	applyFloat := func(key string, min, max float64, setter func(v float64)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if err != nil || parsed < min || parsed > max {
			return
		}
		setter(parsed)
	}

	applyInt(runtimeconfig.KeyHomeDailyRefreshHour, 0, 23, func(v int) {
		result.Home.Daily.RefreshHour = v
	})
	applyInt(runtimeconfig.KeyHomeDailyPoolLimit, 24, 240, func(v int) {
		result.Home.Daily.PoolLimit = v
	})
	applyInt(runtimeconfig.KeyHomeHighScorePoolLimit, 24, 240, func(v int) {
		result.Home.HighScore.PoolLimit = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreMin, 0, 10, func(v float64) {
		result.Home.HighScore.MinScore = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreMax, 0, 10, func(v float64) {
		result.Home.HighScore.MaxScore = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreWindow, 0.0001, 10, func(v float64) {
		result.Home.HighScore.Window = v
	})

	if result.Home.HighScore.MinScore > result.Home.HighScore.MaxScore {
		result.Home.HighScore.MinScore = 8.0
		result.Home.HighScore.MaxScore = 9.9
	}
}

func applyPlayerUpdate(
	input *PlayerSettingsInput,
	effective *Settings,
	updates map[string]*string,
	defaults PlayerSettings,
) error {
	if input == nil {
		return nil
	}

	if input.Enabled != nil {
		value := strconv.FormatBool(*input.Enabled)
		updates[runtimeconfig.KeyPlayerEnabled] = &value
		effective.Player.Enabled = *input.Enabled
	}

	if input.MetadataTimeoutSeconds != nil {
		if *input.MetadataTimeoutSeconds < 5 || *input.MetadataTimeoutSeconds > 300 {
			return fmt.Errorf("%w: player.metadataTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.MetadataTimeoutSeconds)
		updates[runtimeconfig.KeyPlayerMetadataTimeoutSeconds] = &value
		effective.Player.MetadataTimeoutSeconds = *input.MetadataTimeoutSeconds
	}

	if input.HardTimeoutSeconds != nil {
		if *input.HardTimeoutSeconds < 10 || *input.HardTimeoutSeconds > 900 {
			return fmt.Errorf("%w: player.hardTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.HardTimeoutSeconds)
		updates[runtimeconfig.KeyPlayerHardTimeoutSeconds] = &value
		effective.Player.HardTimeoutSeconds = *input.HardTimeoutSeconds
	}

	if effective.Player.HardTimeoutSeconds < effective.Player.MetadataTimeoutSeconds {
		return fmt.Errorf("%w: player.hardTimeoutSeconds", ErrInvalidInput)
	}

	if input.Transmission != nil {
		if input.Transmission.Enabled != nil {
			value := strconv.FormatBool(*input.Transmission.Enabled)
			updates[runtimeconfig.KeyPlayerTransmissionEnabled] = &value
			effective.Player.Transmission.Enabled = *input.Transmission.Enabled
		}
		if input.Transmission.URL != nil {
			normalized := strings.TrimSpace(*input.Transmission.URL)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionURL] = nil
				effective.Player.Transmission.URL = defaults.Transmission.URL
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionURL] = &normalized
				effective.Player.Transmission.URL = normalized
			}
		}
		if input.Transmission.LocalDownloadDir != nil {
			normalized := strings.TrimSpace(*input.Transmission.LocalDownloadDir)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = nil
				effective.Player.Transmission.LocalDownloadDir = defaults.Transmission.LocalDownloadDir
				effective.Player.Transmission.DownloadMappingDirectory = defaults.Transmission.DownloadMappingDirectory
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = &normalized
				effective.Player.Transmission.LocalDownloadDir = normalized
				effective.Player.Transmission.DownloadMappingDirectory = normalized
			}
		}
		if input.Transmission.DownloadMappingDirectory != nil {
			normalized := strings.TrimSpace(*input.Transmission.DownloadMappingDirectory)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = nil
				effective.Player.Transmission.LocalDownloadDir = defaults.Transmission.LocalDownloadDir
				effective.Player.Transmission.DownloadMappingDirectory = defaults.Transmission.DownloadMappingDirectory
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = &normalized
				effective.Player.Transmission.LocalDownloadDir = normalized
				effective.Player.Transmission.DownloadMappingDirectory = normalized
			}
		}
		if input.Transmission.Username != nil {
			normalized := strings.TrimSpace(*input.Transmission.Username)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionUsername] = nil
				effective.Player.Transmission.Username = defaults.Transmission.Username
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionUsername] = &normalized
				effective.Player.Transmission.Username = normalized
			}
		}
		if input.Transmission.Password != nil {
			normalized := strings.TrimSpace(*input.Transmission.Password)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionPassword] = nil
				effective.Player.Transmission.Password = defaults.Transmission.Password
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionPassword] = &normalized
				effective.Player.Transmission.Password = normalized
			}
		}
		if input.Transmission.InsecureTLS != nil {
			value := strconv.FormatBool(*input.Transmission.InsecureTLS)
			updates[runtimeconfig.KeyPlayerTransmissionInsecure] = &value
			effective.Player.Transmission.InsecureTLS = *input.Transmission.InsecureTLS
		}
		if input.Transmission.TimeoutSeconds != nil {
			if *input.Transmission.TimeoutSeconds < 2 || *input.Transmission.TimeoutSeconds > 60 {
				return fmt.Errorf("%w: player.transmission.timeoutSeconds", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.TimeoutSeconds)
			updates[runtimeconfig.KeyPlayerTransmissionTimeoutSec] = &value
			effective.Player.Transmission.TimeoutSeconds = *input.Transmission.TimeoutSeconds
		}
		if input.Transmission.SequentialDownload != nil {
			value := strconv.FormatBool(*input.Transmission.SequentialDownload)
			updates[runtimeconfig.KeyPlayerTransmissionSequential] = &value
			effective.Player.Transmission.SequentialDownload = *input.Transmission.SequentialDownload
		}
		if input.Transmission.AutoCleanupEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupEnabled] = &value
			effective.Player.Transmission.AutoCleanupEnabled = *input.Transmission.AutoCleanupEnabled
		}
		if input.Transmission.AutoCleanupSlowTaskEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupSlowTaskEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled] = &value
			effective.Player.Transmission.AutoCleanupSlowTaskEnabled = *input.Transmission.AutoCleanupSlowTaskEnabled
		}
		if input.Transmission.AutoCleanupStorageEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupStorageEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled] = &value
			effective.Player.Transmission.AutoCleanupStorageEnabled = *input.Transmission.AutoCleanupStorageEnabled
		}
		if input.Transmission.AutoCleanupMaxTasks != nil {
			if *input.Transmission.AutoCleanupMaxTasks < 0 || *input.Transmission.AutoCleanupMaxTasks > 5000 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMaxTasks", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMaxTasks)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks] = &value
			effective.Player.Transmission.AutoCleanupMaxTasks = *input.Transmission.AutoCleanupMaxTasks
		}
		if input.Transmission.AutoCleanupMaxTotalSizeGB != nil {
			if *input.Transmission.AutoCleanupMaxTotalSizeGB < 0 || *input.Transmission.AutoCleanupMaxTotalSizeGB > 32768 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMaxTotalSizeGB", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMaxTotalSizeGB)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB] = &value
			effective.Player.Transmission.AutoCleanupMaxTotalSizeGB = *input.Transmission.AutoCleanupMaxTotalSizeGB
		}
		if input.Transmission.AutoCleanupMinFreeSpaceGB != nil {
			if *input.Transmission.AutoCleanupMinFreeSpaceGB < 0 || *input.Transmission.AutoCleanupMinFreeSpaceGB > 8192 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMinFreeSpaceGB", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMinFreeSpaceGB)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB] = &value
			effective.Player.Transmission.AutoCleanupMinFreeSpaceGB = *input.Transmission.AutoCleanupMinFreeSpaceGB
		}
		if input.Transmission.AutoCleanupSlowWindowMinutes != nil {
			if *input.Transmission.AutoCleanupSlowWindowMinutes < 5 || *input.Transmission.AutoCleanupSlowWindowMinutes > 1440 {
				return fmt.Errorf("%w: player.transmission.autoCleanupSlowWindowMinutes", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupSlowWindowMinutes)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes] = &value
			effective.Player.Transmission.AutoCleanupSlowWindowMinutes = *input.Transmission.AutoCleanupSlowWindowMinutes
		}
		if input.Transmission.AutoCleanupSlowRateKbps != nil {
			if *input.Transmission.AutoCleanupSlowRateKbps < 0 || *input.Transmission.AutoCleanupSlowRateKbps > 102400 {
				return fmt.Errorf("%w: player.transmission.autoCleanupSlowRateKbps", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupSlowRateKbps)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps] = &value
			effective.Player.Transmission.AutoCleanupSlowRateKbps = *input.Transmission.AutoCleanupSlowRateKbps
		}
	}

	if input.FFmpeg != nil {
		if input.FFmpeg.Enabled != nil {
			value := strconv.FormatBool(*input.FFmpeg.Enabled)
			updates[runtimeconfig.KeyPlayerFFmpegEnabled] = &value
			effective.Player.FFmpeg.Enabled = *input.FFmpeg.Enabled
		}
		if input.FFmpeg.BinaryPath != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.BinaryPath)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegBinaryPath] = nil
				effective.Player.FFmpeg.BinaryPath = defaults.FFmpeg.BinaryPath
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegBinaryPath] = &normalized
				effective.Player.FFmpeg.BinaryPath = normalized
			}
		}
		if input.FFmpeg.Preset != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.Preset)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegPreset] = nil
				effective.Player.FFmpeg.Preset = defaults.FFmpeg.Preset
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegPreset] = &normalized
				effective.Player.FFmpeg.Preset = normalized
			}
		}
		if input.FFmpeg.CRF != nil {
			if *input.FFmpeg.CRF < 16 || *input.FFmpeg.CRF > 38 {
				return fmt.Errorf("%w: player.ffmpeg.crf", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.CRF)
			updates[runtimeconfig.KeyPlayerFFmpegCRF] = &value
			effective.Player.FFmpeg.CRF = *input.FFmpeg.CRF
		}
		if input.FFmpeg.AudioBitrateKbps != nil {
			if *input.FFmpeg.AudioBitrateKbps < 64 || *input.FFmpeg.AudioBitrateKbps > 320 {
				return fmt.Errorf("%w: player.ffmpeg.audioBitrateKbps", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.AudioBitrateKbps)
			updates[runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps] = &value
			effective.Player.FFmpeg.AudioBitrateKbps = *input.FFmpeg.AudioBitrateKbps
		}
		if input.FFmpeg.Threads != nil {
			if *input.FFmpeg.Threads < 0 || *input.FFmpeg.Threads > 32 {
				return fmt.Errorf("%w: player.ffmpeg.threads", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.Threads)
			updates[runtimeconfig.KeyPlayerFFmpegThreads] = &value
			effective.Player.FFmpeg.Threads = *input.FFmpeg.Threads
		}
		if input.FFmpeg.ExtraArgs != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.ExtraArgs)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegExtraArgs] = nil
				effective.Player.FFmpeg.ExtraArgs = defaults.FFmpeg.ExtraArgs
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegExtraArgs] = &normalized
				effective.Player.FFmpeg.ExtraArgs = normalized
			}
		}
		if input.FFmpeg.ForceTranscodeExtensions != nil {
			normalized := normalizeFFmpegExtensionList(*input.FFmpeg.ForceTranscodeExtensions)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegForceTranscodeExtensions] = nil
				effective.Player.FFmpeg.ForceTranscodeExtensions = defaults.FFmpeg.ForceTranscodeExtensions
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegForceTranscodeExtensions] = &normalized
				effective.Player.FFmpeg.ForceTranscodeExtensions = normalized
			}
		}
	}

	return nil
}

func applyPlayerMerge(result *Settings, values map[string]string) {
	if raw, ok := values[runtimeconfig.KeyPlayerEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionURL]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.Transmission.URL = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir]; ok {
		normalized := strings.TrimSpace(raw)
		result.Player.Transmission.LocalDownloadDir = normalized
		result.Player.Transmission.DownloadMappingDirectory = normalized
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionUsername]; ok {
		result.Player.Transmission.Username = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionPassword]; ok {
		result.Player.Transmission.Password = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionInsecure]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.InsecureTLS = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionSequential]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.SequentialDownload = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupSlowTaskEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupStorageEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.FFmpeg.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegBinaryPath]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.FFmpeg.BinaryPath = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegPreset]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.FFmpeg.Preset = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegExtraArgs]; ok {
		result.Player.FFmpeg.ExtraArgs = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegForceTranscodeExtensions]; ok {
		normalized := normalizeFFmpegExtensionList(raw)
		if normalized != "" {
			result.Player.FFmpeg.ForceTranscodeExtensions = normalized
		}
	}

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

	applyInt(runtimeconfig.KeyPlayerMetadataTimeoutSeconds, 5, 300, func(v int) {
		result.Player.MetadataTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerHardTimeoutSeconds, 10, 900, func(v int) {
		result.Player.HardTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionTimeoutSec, 2, 60, func(v int) {
		result.Player.Transmission.TimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks, 0, 5000, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTasks = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB, 0, 32768, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTotalSizeGB = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB, 0, 8192, func(v int) {
		result.Player.Transmission.AutoCleanupMinFreeSpaceGB = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes, 5, 1440, func(v int) {
		result.Player.Transmission.AutoCleanupSlowWindowMinutes = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps, 0, 102400, func(v int) {
		result.Player.Transmission.AutoCleanupSlowRateKbps = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegCRF, 16, 38, func(v int) {
		result.Player.FFmpeg.CRF = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps, 64, 320, func(v int) {
		result.Player.FFmpeg.AudioBitrateKbps = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegThreads, 0, 32, func(v int) {
		result.Player.FFmpeg.Threads = v
	})

	if result.Player.HardTimeoutSeconds < result.Player.MetadataTimeoutSeconds {
		result.Player.HardTimeoutSeconds = result.Player.MetadataTimeoutSeconds
	}
	if result.Player.Transmission.DownloadMappingDirectory == "" && result.Player.Transmission.LocalDownloadDir != "" {
		result.Player.Transmission.DownloadMappingDirectory = result.Player.Transmission.LocalDownloadDir
	}
	if result.Player.Transmission.LocalDownloadDir == "" && result.Player.Transmission.DownloadMappingDirectory != "" {
		result.Player.Transmission.LocalDownloadDir = result.Player.Transmission.DownloadMappingDirectory
	}
}

func applyAuthUpdate(
	input *AuthSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	if input == nil {
		return nil
	}
	if input.MembershipEnabled != nil {
		value := strconv.FormatBool(*input.MembershipEnabled)
		updates[runtimeconfig.KeyAuthMembershipEnabled] = &value
		effective.Auth.MembershipEnabled = *input.MembershipEnabled
	}
	if input.RegistrationEnabled != nil {
		value := strconv.FormatBool(*input.RegistrationEnabled)
		updates[runtimeconfig.KeyAuthRegistrationEnabled] = &value
		effective.Auth.RegistrationEnabled = *input.RegistrationEnabled
	}
	if input.InviteRequired != nil {
		value := strconv.FormatBool(*input.InviteRequired)
		updates[runtimeconfig.KeyAuthInviteRequired] = &value
		effective.Auth.InviteRequired = *input.InviteRequired
	}
	return nil
}

func applyAuthMerge(result *Settings, values map[string]string) {
	if raw, ok := values[runtimeconfig.KeyAuthMembershipEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.MembershipEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthRegistrationEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.RegistrationEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthInviteRequired]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.InviteRequired = parsed
		}
	}
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
	mappingDir := strings.TrimSpace(settings.Player.Transmission.DownloadMappingDirectory)
	if mappingDir == "" {
		mappingDir = strings.TrimSpace(settings.Player.Transmission.LocalDownloadDir)
	}

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

		runtimeconfig.KeyMediaAutoCacheCover:       strconv.FormatBool(settings.Performance.Media.AutoCacheCover),
		runtimeconfig.KeyMediaAutoFetchBilingual:   strconv.FormatBool(settings.Performance.Media.AutoFetchBilingual),
		runtimeconfig.KeyMediaWarmupTimeoutSeconds: strconv.Itoa(settings.Performance.Media.WarmupTimeoutSeconds),

		runtimeconfig.KeyHomeDailyRefreshHour:   strconv.Itoa(settings.Home.Daily.RefreshHour),
		runtimeconfig.KeyHomeDailyPoolLimit:     strconv.Itoa(settings.Home.Daily.PoolLimit),
		runtimeconfig.KeyHomeHighScorePoolLimit: strconv.Itoa(settings.Home.HighScore.PoolLimit),
		runtimeconfig.KeyHomeHighScoreMin:       strconv.FormatFloat(settings.Home.HighScore.MinScore, 'f', 4, 64),
		runtimeconfig.KeyHomeHighScoreMax:       strconv.FormatFloat(settings.Home.HighScore.MaxScore, 'f', 4, 64),
		runtimeconfig.KeyHomeHighScoreWindow:    strconv.FormatFloat(settings.Home.HighScore.Window, 'f', 4, 64),

		runtimeconfig.KeyPlayerEnabled:                              strconv.FormatBool(settings.Player.Enabled),
		runtimeconfig.KeyPlayerMetadataTimeoutSeconds:               strconv.Itoa(settings.Player.MetadataTimeoutSeconds),
		runtimeconfig.KeyPlayerHardTimeoutSeconds:                   strconv.Itoa(settings.Player.HardTimeoutSeconds),
		runtimeconfig.KeyPlayerTransmissionEnabled:                  strconv.FormatBool(settings.Player.Transmission.Enabled),
		runtimeconfig.KeyPlayerTransmissionURL:                      settings.Player.Transmission.URL,
		runtimeconfig.KeyPlayerTransmissionLocalDownloadDir:         mappingDir,
		runtimeconfig.KeyPlayerTransmissionUsername:                 settings.Player.Transmission.Username,
		runtimeconfig.KeyPlayerTransmissionPassword:                 settings.Player.Transmission.Password,
		runtimeconfig.KeyPlayerTransmissionInsecure:                 strconv.FormatBool(settings.Player.Transmission.InsecureTLS),
		runtimeconfig.KeyPlayerTransmissionTimeoutSec:               strconv.Itoa(settings.Player.Transmission.TimeoutSeconds),
		runtimeconfig.KeyPlayerTransmissionSequential:               strconv.FormatBool(settings.Player.Transmission.SequentialDownload),
		runtimeconfig.KeyPlayerTransmissionCleanupEnabled:           strconv.FormatBool(settings.Player.Transmission.AutoCleanupEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled:   strconv.FormatBool(settings.Player.Transmission.AutoCleanupSlowTaskEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled:    strconv.FormatBool(settings.Player.Transmission.AutoCleanupStorageEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks:          strconv.Itoa(settings.Player.Transmission.AutoCleanupMaxTasks),
		runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB:    strconv.Itoa(settings.Player.Transmission.AutoCleanupMaxTotalSizeGB),
		runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB:    strconv.Itoa(settings.Player.Transmission.AutoCleanupMinFreeSpaceGB),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes: strconv.Itoa(settings.Player.Transmission.AutoCleanupSlowWindowMinutes),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps:      strconv.Itoa(settings.Player.Transmission.AutoCleanupSlowRateKbps),
		runtimeconfig.KeyPlayerFFmpegEnabled:                        strconv.FormatBool(settings.Player.FFmpeg.Enabled),
		runtimeconfig.KeyPlayerFFmpegBinaryPath:                     settings.Player.FFmpeg.BinaryPath,
		runtimeconfig.KeyPlayerFFmpegPreset:                         settings.Player.FFmpeg.Preset,
		runtimeconfig.KeyPlayerFFmpegCRF:                            strconv.Itoa(settings.Player.FFmpeg.CRF),
		runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps:               strconv.Itoa(settings.Player.FFmpeg.AudioBitrateKbps),
		runtimeconfig.KeyPlayerFFmpegThreads:                        strconv.Itoa(settings.Player.FFmpeg.Threads),
		runtimeconfig.KeyPlayerFFmpegExtraArgs:                      settings.Player.FFmpeg.ExtraArgs,
		runtimeconfig.KeyPlayerFFmpegForceTranscodeExtensions:       settings.Player.FFmpeg.ForceTranscodeExtensions,

		runtimeconfig.KeyAuthMembershipEnabled:   strconv.FormatBool(settings.Auth.MembershipEnabled),
		runtimeconfig.KeyAuthRegistrationEnabled: strconv.FormatBool(settings.Auth.RegistrationEnabled),
		runtimeconfig.KeyAuthInviteRequired:      strconv.FormatBool(settings.Auth.InviteRequired),
	}
}

func normalizeFFmpegExtensionList(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	parts := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ';'
	})
	if len(parts) == 0 {
		return ""
	}

	seen := make(map[string]struct{}, len(parts))
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.ToLower(strings.TrimSpace(part))
		item = strings.TrimPrefix(item, "*")
		if item == "" {
			continue
		}
		if !strings.HasPrefix(item, ".") {
			item = "." + item
		}
		valid := true
		for _, ch := range item {
			if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-' {
				continue
			}
			valid = false
			break
		}
		if !valid || len(item) < 2 || len(item) > 16 {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		normalized = append(normalized, item)
	}
	if len(normalized) == 0 {
		return ""
	}
	sort.Strings(normalized)
	return strings.Join(normalized, ",")
}

func namedLogger(logger *zap.Logger, name string) *zap.Logger {
	if logger == nil {
		return zap.NewNop()
	}
	return logger.Named(name)
}

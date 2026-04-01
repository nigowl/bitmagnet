package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/logging"
	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"github.com/nigowl/bitmagnet/internal/tmdb"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrInvalidInput = errors.New("invalid input")
var ErrUnsupportedPlugin = errors.New("unsupported plugin")

type Settings struct {
	LogLevel             string  `json:"logLevel"`
	TMDBEnabled          bool    `json:"tmdbEnabled"`
	IMDbEnabled          bool    `json:"imdbEnabled"`
	DoubanEnabled        bool    `json:"doubanEnabled"`
	DoubanMinScore       float64 `json:"doubanMinScore"`
	DoubanCookie         string  `json:"doubanCookie"`
	DoubanUserAgent      string  `json:"doubanUserAgent"`
	DoubanAcceptLanguage string  `json:"doubanAcceptLanguage"`
	DoubanReferer        string  `json:"doubanReferer"`
}

type UpdateInput struct {
	LogLevel             *string  `json:"logLevel"`
	TMDBEnabled          *bool    `json:"tmdbEnabled"`
	IMDbEnabled          *bool    `json:"imdbEnabled"`
	DoubanEnabled        *bool    `json:"doubanEnabled"`
	DoubanMinScore       *float64 `json:"doubanMinScore"`
	DoubanCookie         *string  `json:"doubanCookie"`
	DoubanUserAgent      *string  `json:"doubanUserAgent"`
	DoubanAcceptLanguage *string  `json:"doubanAcceptLanguage"`
	DoubanReferer        *string  `json:"doubanReferer"`
}

type Service interface {
	Get(ctx context.Context) (Settings, error)
	Update(ctx context.Context, input UpdateInput) (Settings, error)
	SyncRuntime(ctx context.Context) error
	TestPlugin(ctx context.Context, pluginKey string, input PluginTestInput) (PluginTestResult, error)
	BackfillLocalizedMetadata(ctx context.Context, limit int) (media.BackfillLocalizedResult, error)
	StartMaintenanceTask(ctx context.Context, input MaintenanceTaskInput) (MaintenanceTask, error)
	GetMaintenanceTask(ctx context.Context, taskID string) (MaintenanceTask, error)
}

type Params struct {
	fx.In
	DB              lazy.Lazy[*gorm.DB]
	LogConfig       logging.Config
	MediaConfig     media.Config
	MediaService    media.Service
	TMDBClient      lazy.Lazy[tmdb.Client]
	LevelController logging.LevelController `optional:"true"`
	Logger          *zap.Logger             `optional:"true"`
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
	}

	return &service{
		db:               p.DB,
		levelController:  p.LevelController,
		defaults:         defaults,
		mediaConfig:      p.MediaConfig,
		mediaService:     p.MediaService,
		tmdbClient:       p.TMDBClient,
		logger:           namedLogger(p.Logger, "media_site_plugins.settings"),
		maintenanceTasks: make(map[string]*MaintenanceTask),
	}
}

type service struct {
	db               lazy.Lazy[*gorm.DB]
	levelController  logging.LevelController
	defaults         Settings
	mediaConfig      media.Config
	mediaService     media.Service
	tmdbClient       lazy.Lazy[tmdb.Client]
	logger           *zap.Logger
	maintenanceMu    sync.RWMutex
	maintenanceTasks map[string]*MaintenanceTask
	maintenanceSeq   uint64
}

func (s *service) Get(ctx context.Context) (Settings, error) {
	db, err := s.db.Get()
	if err != nil {
		return Settings{}, err
	}

	values, err := readValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return Settings{}, err
	}

	return s.merge(values), nil
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
	currentValues, err := readValues(ctx, db, runtimeconfig.AdminEditableKeys())
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

	return effective, nil
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

	return result
}

func readValues(ctx context.Context, db *gorm.DB, keys []string) (map[string]string, error) {
	if len(keys) == 0 {
		return map[string]string{}, nil
	}

	var items []model.KeyValue
	if err := db.WithContext(ctx).
		Table(model.TableNameKeyValue).
		Where("key IN ?", keys).
		Find(&items).Error; err != nil {
		return nil, err
	}

	result := make(map[string]string, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		result[key] = item.Value
	}
	return result, nil
}

func ptr(value string) *string {
	return &value
}

func namedLogger(logger *zap.Logger, name string) *zap.Logger {
	if logger == nil {
		return zap.NewNop()
	}
	return logger.Named(name)
}

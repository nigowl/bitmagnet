package douban

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Config struct {
	Enabled        bool
	SuggestURL     string
	SearchURL      string
	MinScore       float64
	HTTPTimeout    time.Duration
	Cookie         string
	UserAgent      string
	AcceptLanguage string
	Referer        string
	Logger         *zap.Logger
}

type Plugin struct {
	matcher          *matcher
	baseConfig       Config
	configCacheTTL   time.Duration
	configCacheMutex sync.RWMutex
	cachedConfig     Config
	cachedAt         time.Time
	cacheLoaded      bool
	logger           *zap.Logger
}

func New(config Config) *Plugin {
	logger := config.Logger
	if logger == nil {
		logger = zap.NewNop()
	}

	return &Plugin{
		matcher:        newMatcher(config),
		baseConfig:     config,
		configCacheTTL: 15 * time.Second,
		logger:         logger,
	}
}

func (p *Plugin) InvalidateRuntimeSettingsCache() {
	if p == nil {
		return
	}

	p.configCacheMutex.Lock()
	p.cacheLoaded = false
	p.cachedAt = time.Time{}
	p.cachedConfig = Config{}
	p.configCacheMutex.Unlock()
}

func (p *Plugin) Key() string {
	return model.SourceDouban
}

func (p *Plugin) Enrich(ctx context.Context, db *gorm.DB, entry model.MediaEntry) (bool, error) {
	if p == nil || entry.DoubanID.Valid {
		if p != nil && p.logger != nil && entry.DoubanID.Valid {
			p.logger.Debug("skip douban plugin: douban id already exists", zap.String("mediaID", entry.ID), zap.String("doubanID", entry.DoubanID.String))
		}
		return false, nil
	}
	if p.logger != nil {
		p.logger.Debug(
			"douban plugin enrich start",
			zap.String("mediaID", entry.ID),
			zap.String("contentType", entry.ContentType.String()),
			zap.String("inputOriginal", strings.TrimSpace(entry.NameOriginal.String)),
			zap.String("inputEn", strings.TrimSpace(entry.NameEn.String)),
			zap.String("inputZh", strings.TrimSpace(entry.NameZh.String)),
			zap.Int("releaseYear", int(entry.ReleaseYear)),
		)
	}

	activeMatcher := p.matcher
	if runtimeMatcher := p.runtimeMatcher(ctx, db); runtimeMatcher != nil {
		activeMatcher = runtimeMatcher
	}
	if activeMatcher == nil {
		return false, nil
	}

	match, ok, err := activeMatcher.match(ctx, entry)
	if err != nil || !ok {
		if p.logger != nil {
			if err != nil {
				p.logger.Warn("douban plugin match failed", zap.String("mediaID", entry.ID), zap.Error(err))
			} else {
				p.logger.Debug("douban plugin no match", zap.String("mediaID", entry.ID))
			}
		}
		return false, err
	}
	if p.logger != nil {
		p.logger.Debug(
			"douban plugin matched",
			zap.String("mediaID", entry.ID),
			zap.String("doubanID", match.ID),
			zap.String("title", match.Title),
			zap.String("subTitle", match.SubTitle),
			zap.Float64("score", match.Score),
		)
	}

	now := time.Now()
	if err := db.WithContext(ctx).
		Table(model.TableNameMetadataSource).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "updated_at"}),
		}).
		Create(&model.MetadataSource{
			Key:       model.SourceDouban,
			Name:      "Douban",
			CreatedAt: now,
			UpdatedAt: now,
		}).Error; err != nil {
		if p.logger != nil {
			p.logger.Warn("douban plugin metadata source upsert failed", zap.String("mediaID", entry.ID), zap.Error(err))
		}
		return false, nil
	}

	attrs := []model.ContentAttribute{
		{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "id",
			Value:         match.ID,
			CreatedAt:     now,
			UpdatedAt:     now,
		},
	}
	if match.Title != "" {
		attrs = append(attrs, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "title",
			Value:         match.Title,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	if match.SubTitle != "" {
		attrs = append(attrs, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "sub_title",
			Value:         match.SubTitle,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}

	for _, attr := range attrs {
		if err := db.WithContext(ctx).
			Table(model.TableNameContentAttribute).
			Clauses(clause.OnConflict{
				Columns: []clause.Column{
					{Name: "content_type"},
					{Name: "content_source"},
					{Name: "content_id"},
					{Name: "source"},
					{Name: "key"},
				},
				DoUpdates: clause.Assignments(map[string]any{
					"value":      attr.Value,
					"updated_at": now,
				}),
			}).
			Create(&attr).Error; err != nil {
			if p.logger != nil {
				p.logger.Warn("douban plugin attribute upsert failed", zap.String("mediaID", entry.ID), zap.String("key", attr.Key), zap.Error(err))
			}
			return false, nil
		}
	}
	if p.logger != nil {
		p.logger.Debug("douban plugin enrich success", zap.String("mediaID", entry.ID), zap.String("doubanID", match.ID))
	}

	return true, nil
}

func (p *Plugin) runtimeMatcher(ctx context.Context, db *gorm.DB) *matcher {
	if p == nil {
		return nil
	}

	now := time.Now()
	p.configCacheMutex.RLock()
	useCache := p.cacheLoaded && now.Sub(p.cachedAt) < p.configCacheTTL
	cached := p.cachedConfig
	p.configCacheMutex.RUnlock()
	if useCache {
		return newMatcher(cached)
	}

	cfg := p.baseConfig
	values, err := readRuntimeValues(ctx, db)
	if err != nil {
		return p.matcher
	}

	if raw, ok := values[runtimeconfig.KeyMediaDoubanEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			cfg.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanMinScore]; ok {
		if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(raw), 64); parseErr == nil && parsed >= 0 && parsed <= 1 {
			cfg.MinScore = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanCookie]; ok {
		cfg.Cookie = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanUserAgent]; ok {
		cfg.UserAgent = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanAcceptLanguage]; ok {
		cfg.AcceptLanguage = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyMediaDoubanReferer]; ok {
		cfg.Referer = strings.TrimSpace(raw)
	}

	p.configCacheMutex.Lock()
	p.cacheLoaded = true
	p.cachedConfig = cfg
	p.cachedAt = now
	p.configCacheMutex.Unlock()

	return newMatcher(cfg)
}

func readRuntimeValues(ctx context.Context, db *gorm.DB) (map[string]string, error) {
	if db == nil {
		return map[string]string{}, nil
	}

	keys := runtimeconfig.DoubanKeys()
	var rows []model.KeyValue
	if err := db.WithContext(ctx).
		Table(model.TableNameKeyValue).
		Where("key IN ?", keys).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[string]string, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		result[key] = row.Value
	}
	return result, nil
}

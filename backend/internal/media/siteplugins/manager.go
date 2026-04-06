package siteplugins

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type Plugin interface {
	Key() string
	Enrich(ctx context.Context, db *gorm.DB, entry model.MediaEntry) (bool, error)
}

type ManagerOptions struct {
	Logger         *zap.Logger
	DefaultEnabled map[string]bool
	CacheTTL       time.Duration
}

type EnrichOptions struct {
	Force      bool
	PluginKeys []string
}

type managedPlugin struct {
	key    string
	plugin Plugin
}

type Manager struct {
	plugins        []managedPlugin
	logger         *zap.Logger
	defaultEnabled map[string]bool

	configCacheTTL   time.Duration
	configCacheMutex sync.RWMutex
	cacheLoaded      bool
	cachedAt         time.Time
	cachedEnabled    map[string]bool
}

type runtimeConfigInvalidator interface {
	InvalidateRuntimeSettingsCache()
}

func NewManager(options ManagerOptions, plugins ...Plugin) *Manager {
	filtered := make([]managedPlugin, 0, len(plugins))
	seen := make(map[string]struct{}, len(plugins))

	for _, plugin := range plugins {
		if plugin == nil {
			continue
		}
		key := normalizePluginKey(plugin.Key())
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		filtered = append(filtered, managedPlugin{
			key:    key,
			plugin: plugin,
		})
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		return filtered[i].key < filtered[j].key
	})

	logger := options.Logger
	if logger == nil {
		logger = zap.NewNop()
	}

	cacheTTL := options.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = 15 * time.Second
	}

	defaultEnabled := make(map[string]bool, len(options.DefaultEnabled))
	for key, value := range options.DefaultEnabled {
		normalizedKey := normalizePluginKey(key)
		if normalizedKey == "" {
			continue
		}
		defaultEnabled[normalizedKey] = value
	}

	return &Manager{
		plugins:        filtered,
		logger:         logger,
		defaultEnabled: defaultEnabled,
		configCacheTTL: cacheTTL,
	}
}

func (m *Manager) InvalidateRuntimeSettingsCache() {
	if m == nil {
		return
	}

	m.configCacheMutex.Lock()
	m.cacheLoaded = false
	m.cachedAt = time.Time{}
	m.cachedEnabled = nil
	m.configCacheMutex.Unlock()

	for _, item := range m.plugins {
		if item.plugin == nil {
			continue
		}
		if invalidator, ok := item.plugin.(runtimeConfigInvalidator); ok {
			invalidator.InvalidateRuntimeSettingsCache()
		}
	}
}

func (m *Manager) Enrich(ctx context.Context, db *gorm.DB, entry model.MediaEntry, options ...EnrichOptions) model.MediaEntry {
	if m == nil || len(m.plugins) == 0 {
		return entry
	}

	var opt EnrichOptions
	if len(options) > 0 {
		opt = options[0]
	}

	current := entry
	statusMap := cloneSiteSyncStatusMap(current.ExternalSiteStatus)
	for _, item := range m.plugins {
		if !pluginAllowed(item.key, opt.PluginKeys) {
			continue
		}

		enabled := m.pluginEnabled(ctx, db, item.key)
		if !enabled {
			m.logger.Debug("media site plugin skipped: disabled", zap.String("plugin", item.key), zap.String("mediaID", current.ID))
			continue
		}
		if !opt.Force {
			if _, exists := statusMap[item.key]; exists {
				m.logger.Debug("media site plugin skipped: cached status", zap.String("plugin", item.key), zap.String("mediaID", current.ID))
				continue
			}
		}
		m.logger.Debug(
			"media site plugin start",
			zap.String("plugin", item.key),
			zap.String("mediaID", current.ID),
			zap.String("contentSource", current.ContentSource),
			zap.String("contentID", current.ContentID),
			zap.String("title", current.Title),
		)

		changed, err := item.plugin.Enrich(ctx, db, current)
		now := time.Now()
		status := model.MediaSiteSyncStatus{
			AttemptedAt: &now,
			Success:     err == nil,
			Changed:     changed,
		}
		if err != nil {
			status.Error = err.Error()
		}
		statusMap[item.key] = status
		if persistErr := persistSiteSyncStatus(ctx, db, current.ID, statusMap, now); persistErr != nil {
			m.logger.Warn("media site plugin status update failed", zap.String("plugin", item.key), zap.String("mediaID", current.ID), zap.Error(persistErr))
		}
		current.ExternalSiteStatus = cloneSiteSyncStatusMap(statusMap)

		if err != nil {
			m.logger.Warn("media site plugin failed", zap.String("plugin", item.key), zap.String("mediaID", current.ID), zap.Error(err))
			continue
		}
		if !changed {
			m.logger.Debug("media site plugin no changes", zap.String("plugin", item.key), zap.String("mediaID", current.ID))
			continue
		}

		var refreshed model.MediaEntry
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", current.ID).
			Take(&refreshed).Error; err != nil {
			m.logger.Warn("media site plugin result reload failed", zap.String("plugin", item.key), zap.String("mediaID", current.ID), zap.Error(err))
			continue
		}
		current = refreshed
		statusMap = cloneSiteSyncStatusMap(current.ExternalSiteStatus)
		m.logger.Debug(
			"media site plugin applied",
			zap.String("plugin", item.key),
			zap.String("mediaID", current.ID),
			zap.String("outputIMDbID", current.IMDbID.String),
			zap.String("outputDoubanID", current.DoubanID.String),
			zap.Int("outputAttributes", len(current.Attributes)),
		)
	}

	return current
}

func pluginAllowed(pluginKey string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	target := normalizePluginKey(pluginKey)
	for _, key := range allowed {
		if normalizePluginKey(key) == target {
			return true
		}
	}
	return false
}

func cloneSiteSyncStatusMap(src map[string]model.MediaSiteSyncStatus) map[string]model.MediaSiteSyncStatus {
	if len(src) == 0 {
		return map[string]model.MediaSiteSyncStatus{}
	}
	dst := make(map[string]model.MediaSiteSyncStatus, len(src))
	for key, value := range src {
		dst[normalizePluginKey(key)] = value
	}
	return dst
}

func persistSiteSyncStatus(
	ctx context.Context,
	db *gorm.DB,
	mediaID string,
	status map[string]model.MediaSiteSyncStatus,
	updatedAt time.Time,
) error {
	if db == nil || strings.TrimSpace(mediaID) == "" {
		return nil
	}

	return db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id = ?", mediaID).
		Updates(map[string]any{
			"external_site_status": status,
			"updated_at":           updatedAt,
		}).Error
}

func (m *Manager) pluginEnabled(ctx context.Context, db *gorm.DB, pluginKey string) bool {
	key, ok := runtimeconfig.SitePluginEnabledKey(pluginKey)
	if !ok {
		return true
	}

	enabledValues := m.loadRuntimeEnabledValues(ctx, db)
	if value, exists := enabledValues[key]; exists {
		return value
	}

	if value, exists := m.defaultEnabled[normalizePluginKey(pluginKey)]; exists {
		return value
	}

	return true
}

func (m *Manager) loadRuntimeEnabledValues(ctx context.Context, db *gorm.DB) map[string]bool {
	if m == nil || db == nil {
		return map[string]bool{}
	}

	now := time.Now()
	m.configCacheMutex.RLock()
	useCache := m.cacheLoaded && now.Sub(m.cachedAt) < m.configCacheTTL
	cached := cloneEnabledMap(m.cachedEnabled)
	m.configCacheMutex.RUnlock()
	if useCache {
		return cached
	}

	rawValues, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.SitePluginEnabledKeys())
	if err != nil {
		m.logger.Warn("load media site plugin runtime settings failed", zap.Error(err))
		return cached
	}

	values := make(map[string]bool, len(rawValues))
	for rawKey, rawValue := range rawValues {
		parsed, parseErr := strconv.ParseBool(strings.TrimSpace(rawValue))
		if parseErr != nil {
			continue
		}
		values[rawKey] = parsed
	}

	m.configCacheMutex.Lock()
	m.cacheLoaded = true
	m.cachedAt = now
	m.cachedEnabled = cloneEnabledMap(values)
	m.configCacheMutex.Unlock()

	return values
}

func cloneEnabledMap(src map[string]bool) map[string]bool {
	if len(src) == 0 {
		return map[string]bool{}
	}

	dst := make(map[string]bool, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}

func normalizePluginKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}

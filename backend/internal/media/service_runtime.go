package media

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

type mediaRuntimeSettings struct {
	configCacheTTL time.Duration
	defaults       mediaRuntimeOptions

	mutex       sync.RWMutex
	cacheLoaded bool
	cachedAt    time.Time
	cached      mediaRuntimeOptions
}

type mediaRuntimeOptions struct {
	autoCacheCover     bool
	autoFetchBilingual bool
	homeHotDays        int
}

func newMediaRuntimeSettings() mediaRuntimeSettings {
	defaults := mediaRuntimeOptions{
		autoCacheCover:     true,
		autoFetchBilingual: true,
		homeHotDays:        defaultHomeHotDays,
	}
	return mediaRuntimeSettings{
		configCacheTTL: 15 * time.Second,
		defaults:       defaults,
		cached:         defaults,
	}
}

func (s *service) InvalidateRuntimeSettingsCache() {
	if s == nil {
		return
	}

	s.runtime.mutex.Lock()
	s.runtime.cacheLoaded = false
	s.runtime.cachedAt = time.Time{}
	s.runtime.cached = s.runtime.defaults
	s.runtime.mutex.Unlock()

	if s.sitePluginManager != nil {
		s.sitePluginManager.InvalidateRuntimeSettingsCache()
	}
}

func (s *service) loadRuntimeOptions(ctx context.Context, db *gorm.DB) mediaRuntimeOptions {
	if db == nil {
		return s.runtime.defaults
	}

	now := time.Now()
	s.runtime.mutex.RLock()
	useCache := s.runtime.cacheLoaded && now.Sub(s.runtime.cachedAt) < s.runtime.configCacheTTL
	cached := s.runtime.cached
	defaults := s.runtime.defaults
	s.runtime.mutex.RUnlock()
	if useCache {
		return cached
	}

	values, err := runtimeconfig.ReadValues(ctx, db, []string{
		runtimeconfig.KeyMediaAutoCacheCover,
		runtimeconfig.KeyMediaAutoFetchBilingual,
		runtimeconfig.KeyHomeHotDays,
	})
	if err != nil {
		return cached
	}

	parsed := defaults
	for rawKey, value := range values {
		switch rawKey {
		case runtimeconfig.KeyMediaAutoCacheCover:
			parsedValue, err := strconv.ParseBool(strings.TrimSpace(value))
			if err != nil {
				continue
			}
			parsed.autoCacheCover = parsedValue
		case runtimeconfig.KeyMediaAutoFetchBilingual:
			parsedValue, err := strconv.ParseBool(strings.TrimSpace(value))
			if err != nil {
				continue
			}
			parsed.autoFetchBilingual = parsedValue
		case runtimeconfig.KeyHomeHotDays:
			parsedValue, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				continue
			}
			parsed.homeHotDays = clampHomeHotDays(parsedValue)
		}
	}

	s.runtime.mutex.Lock()
	s.runtime.cacheLoaded = true
	s.runtime.cachedAt = now
	s.runtime.cached = parsed
	s.runtime.mutex.Unlock()

	return parsed
}

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

func parseRuntimeBool(raw string) (bool, bool) {
	parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
	return parsed, err == nil
}

func parseRuntimeInt(raw string) (int, bool) {
	parsed, err := strconv.Atoi(strings.TrimSpace(raw))
	return parsed, err == nil
}

func parseRuntimeIntInRange(raw string, min int, max int) (int, bool) {
	parsed, ok := parseRuntimeInt(raw)
	if !ok || parsed < min || parsed > max {
		return 0, false
	}
	return parsed, true
}

func applyRuntimeString(values map[string]string, key string, allowEmpty bool, setter func(string)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" && !allowEmpty {
		return
	}
	setter(trimmed)
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
			if parsedValue, ok := parseRuntimeBool(value); ok {
				parsed.autoCacheCover = parsedValue
			}
		case runtimeconfig.KeyMediaAutoFetchBilingual:
			if parsedValue, ok := parseRuntimeBool(value); ok {
				parsed.autoFetchBilingual = parsedValue
			}
		case runtimeconfig.KeyHomeHotDays:
			if parsedValue, ok := parseRuntimeInt(value); ok {
				parsed.homeHotDays = clampHomeHotDays(parsedValue)
			}
		}
	}

	s.runtime.mutex.Lock()
	s.runtime.cacheLoaded = true
	s.runtime.cachedAt = now
	s.runtime.cached = parsed
	s.runtime.mutex.Unlock()

	return parsed
}

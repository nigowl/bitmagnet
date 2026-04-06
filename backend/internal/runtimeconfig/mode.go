package runtimeconfig

import (
	"os"
	"strings"
)

const (
	ModeDevelopment = "development"
	ModeProduction  = "production"
)

const (
	envRuntimeModePrimary = "BITMAGNET_RUNTIME_MODE"
	envRuntimeModeCompat  = "BITMAGNET_ENV"
)

func ActiveMode() string {
	if raw := strings.TrimSpace(os.Getenv(envRuntimeModePrimary)); raw != "" {
		return normalizeMode(raw)
	}
	if raw := strings.TrimSpace(os.Getenv(envRuntimeModeCompat)); raw != "" {
		return normalizeMode(raw)
	}
	return ModeProduction
}

func ScopedKey(key string) string {
	return scopedKeyForMode(ActiveMode(), key)
}

func scopedKeyForMode(mode string, key string) string {
	mode = normalizeMode(mode)
	trimmed := normalizeRuntimeKey(key)
	if trimmed == "" {
		return ""
	}
	if _, base, ok := parseScopedKey(trimmed); ok {
		trimmed = base
	}
	if mode == ModeDevelopment {
		return "dev:" + trimmed
	}
	return trimmed
}

func parseScopedKey(key string) (mode string, baseKey string, ok bool) {
	trimmed := normalizeRuntimeKey(key)
	switch {
	case strings.HasPrefix(trimmed, "dev:"):
		base := normalizeRuntimeKey(strings.TrimPrefix(trimmed, "dev:"))
		if base == "" {
			return "", "", false
		}
		return ModeDevelopment, base, true
	case strings.HasPrefix(trimmed, "prod:"):
		base := normalizeRuntimeKey(strings.TrimPrefix(trimmed, "prod:"))
		if base == "" {
			return "", "", false
		}
		return ModeProduction, base, true
	default:
		return "", "", false
	}
}

func normalizeRuntimeKey(key string) string {
	return strings.TrimSpace(key)
}

func normalizeMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dev", "development", "local":
		return ModeDevelopment
	case "prod", "production", "release", "online":
		return ModeProduction
	default:
		return ModeProduction
	}
}

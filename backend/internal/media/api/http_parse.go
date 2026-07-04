package mediaapi

import (
	"math"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func parseInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseBool(raw string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func parseFloat(raw string, fallback float64) float64 {
	value, ok := parseFiniteFloat(raw)
	if !ok {
		return fallback
	}
	return value
}

func parseOptionalFloat(raw string) *float64 {
	value, ok := parseFiniteFloat(raw)
	if !ok {
		return nil
	}
	return &value
}

func parseFiniteFloat(raw string) (float64, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, false
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, false
	}
	return value, true
}

func parseOptionalPositiveInt(value string) *int {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return nil
	}

	return &parsed
}

func parseInt64(raw string, fallback int64) int64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return fallback
	}
	value, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func parseStringListQuery(c *gin.Context, keys ...string) []string {
	if len(keys) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		values := c.QueryArray(key)
		if len(values) == 0 {
			if raw := c.Query(key); raw != "" {
				values = []string{raw}
			}
		}
		for _, raw := range values {
			parts := strings.Split(raw, ",")
			for _, part := range parts {
				value := strings.TrimSpace(part)
				if value == "" {
					continue
				}
				if _, ok := seen[value]; ok {
					continue
				}
				seen[value] = struct{}{}
				result = append(result, value)
			}
		}
	}
	return result
}

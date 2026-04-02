package dhtcrawler

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

func loadRuntimeConfig(ctx context.Context, db *gorm.DB, defaults Config) Config {
	if db == nil {
		return defaults
	}

	values, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.PerformanceKeys())
	if err != nil {
		return defaults
	}

	result := defaults
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
		result.ScalingFactor = uint(v)
	})
	applyInt(runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds, 10, 3600, func(v int) {
		result.ReseedBootstrapNodesInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyDHTCrawlerSaveFilesThreshold, 1, 20000, func(v int) {
		result.SaveFilesThreshold = uint(v)
	})
	applyBool(runtimeconfig.KeyDHTCrawlerSavePieces, func(v bool) {
		result.SavePieces = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours, 1, 24*365, func(v int) {
		result.RescrapeThreshold = time.Duration(v) * time.Hour
	})
	applyInt(runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds, 5, 3600, func(v int) {
		result.StatusLogInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds, 1, 600, func(v int) {
		result.GetOldestNodesInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes, 1, 24*60, func(v int) {
		result.OldPeerThreshold = time.Duration(v) * time.Minute
	})

	return result
}

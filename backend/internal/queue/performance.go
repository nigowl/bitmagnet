package queue

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

const (
	QueueNameProcessTorrent      = "process_torrent"
	QueueNameProcessTorrentBatch = "process_torrent_batch"
	QueueNameRefreshMediaMeta    = "refresh_media_metadata"
	QueueNameBackfillCoverCache  = "backfill_cover_cache"
)

type PerformanceConfig struct {
	ProcessTorrentConcurrency      int
	ProcessTorrentCheckInterval    time.Duration
	ProcessTorrentTimeout          time.Duration
	ProcessTorrentBatchConcurrency int
	ProcessTorrentBatchCheckIntvl  time.Duration
	ProcessTorrentBatchTimeout     time.Duration
	RefreshMediaMetaConcurrency    int
	RefreshMediaMetaCheckInterval  time.Duration
	RefreshMediaMetaTimeout        time.Duration
	BackfillCoverConcurrency       int
	BackfillCoverCheckInterval     time.Duration
	BackfillCoverTimeout           time.Duration
}

type HandlerConfig struct {
	Concurrency   int
	CheckInterval time.Duration
	JobTimeout    time.Duration
}

func NewDefaultPerformanceConfig() PerformanceConfig {
	return PerformanceConfig{
		ProcessTorrentConcurrency:      1,
		ProcessTorrentCheckInterval:    30 * time.Second,
		ProcessTorrentTimeout:          10 * time.Minute,
		ProcessTorrentBatchConcurrency: 1,
		ProcessTorrentBatchCheckIntvl:  30 * time.Second,
		ProcessTorrentBatchTimeout:     10 * time.Minute,
		RefreshMediaMetaConcurrency:    1,
		RefreshMediaMetaCheckInterval:  30 * time.Second,
		RefreshMediaMetaTimeout:        20 * time.Minute,
		BackfillCoverConcurrency:       1,
		BackfillCoverCheckInterval:     30 * time.Second,
		BackfillCoverTimeout:           20 * time.Minute,
	}
}

func LoadPerformanceConfig(ctx context.Context, db *gorm.DB, defaults PerformanceConfig) PerformanceConfig {
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

	applyInt(runtimeconfig.KeyQueueProcessTorrentConcurrency, 1, 128, func(v int) {
		result.ProcessTorrentConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds, 1, 300, func(v int) {
		result.ProcessTorrentCheckInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds, 5, 7200, func(v int) {
		result.ProcessTorrentTimeout = time.Duration(v) * time.Second
	})

	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchConcurrency, 1, 128, func(v int) {
		result.ProcessTorrentBatchConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds, 1, 300, func(v int) {
		result.ProcessTorrentBatchCheckIntvl = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds, 5, 7200, func(v int) {
		result.ProcessTorrentBatchTimeout = time.Duration(v) * time.Second
	})

	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency, 1, 128, func(v int) {
		result.RefreshMediaMetaConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds, 1, 300, func(v int) {
		result.RefreshMediaMetaCheckInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds, 5, 7200, func(v int) {
		result.RefreshMediaMetaTimeout = time.Duration(v) * time.Second
	})

	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheConcurrency, 1, 128, func(v int) {
		result.BackfillCoverConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds, 1, 300, func(v int) {
		result.BackfillCoverCheckInterval = time.Duration(v) * time.Second
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds, 5, 7200, func(v int) {
		result.BackfillCoverTimeout = time.Duration(v) * time.Second
	})

	return result
}

func (c PerformanceConfig) HandlerConfig(queueName string) HandlerConfig {
	switch queueName {
	case QueueNameProcessTorrent:
		return HandlerConfig{
			Concurrency:   c.ProcessTorrentConcurrency,
			CheckInterval: c.ProcessTorrentCheckInterval,
			JobTimeout:    c.ProcessTorrentTimeout,
		}
	case QueueNameProcessTorrentBatch:
		return HandlerConfig{
			Concurrency:   c.ProcessTorrentBatchConcurrency,
			CheckInterval: c.ProcessTorrentBatchCheckIntvl,
			JobTimeout:    c.ProcessTorrentBatchTimeout,
		}
	case QueueNameRefreshMediaMeta:
		return HandlerConfig{
			Concurrency:   c.RefreshMediaMetaConcurrency,
			CheckInterval: c.RefreshMediaMetaCheckInterval,
			JobTimeout:    c.RefreshMediaMetaTimeout,
		}
	case QueueNameBackfillCoverCache:
		return HandlerConfig{
			Concurrency:   c.BackfillCoverConcurrency,
			CheckInterval: c.BackfillCoverCheckInterval,
			JobTimeout:    c.BackfillCoverTimeout,
		}
	default:
		return HandlerConfig{
			Concurrency:   1,
			CheckInterval: 30 * time.Second,
			JobTimeout:    30 * time.Second,
		}
	}
}

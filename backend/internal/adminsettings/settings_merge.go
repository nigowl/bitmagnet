package adminsettings

import (
	"strings"

	"github.com/nigowl/bitmagnet/internal/logging"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func (s *service) merge(values map[string]string) Settings {
	result := s.defaults

	if level, ok := values[runtimeconfig.KeySystemLogLevel]; ok {
		if normalized, err := logging.NormalizeLevel(level); err == nil {
			result.LogLevel = normalized
		}
	}
	applyParsedBool(values, runtimeconfig.KeyMediaTMDBEnabled, func(v bool) {
		result.TMDBEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyMediaIMDbEnabled, func(v bool) {
		result.IMDbEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyMediaDoubanEnabled, func(v bool) {
		result.DoubanEnabled = v
	})
	if raw, ok := values[runtimeconfig.KeyMediaDoubanMinScore]; ok {
		if parsed, ok := parseTrimmedFloatInRange(raw, 0, 1); ok {
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

func applyDHTPerformanceMerge(result *Settings, values map[string]string) {
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerScalingFactor, 1, 200, func(v int) {
		result.Performance.DHT.ScalingFactor = uint(v)
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds, 10, 3600, func(v int) {
		result.Performance.DHT.ReseedIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerSaveFilesThreshold, 1, 20000, func(v int) {
		result.Performance.DHT.SaveFilesThreshold = uint(v)
	})
	applyParsedBool(values, runtimeconfig.KeyDHTCrawlerSavePieces, func(v bool) {
		result.Performance.DHT.SavePieces = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours, 1, 24*365, func(v int) {
		result.Performance.DHT.RescrapeThresholdHours = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds, 5, 3600, func(v int) {
		result.Performance.DHT.StatusLogIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds, 1, 600, func(v int) {
		result.Performance.DHT.GetOldestNodesIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes, 1, 24*60, func(v int) {
		result.Performance.DHT.OldPeerThresholdMinutes = v
	})
	applyParsedBool(values, runtimeconfig.KeyDHTCrawlerScheduleEnabled, func(v bool) {
		result.Performance.DHT.ScheduleEnabled = v
	})
	applyWeekdays(values, runtimeconfig.KeyDHTCrawlerScheduleWeekdays, func(v []int) {
		result.Performance.DHT.ScheduleWeekdays = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerScheduleStartHour, 0, 23, func(v int) {
		result.Performance.DHT.ScheduleStartHour = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyDHTCrawlerScheduleEndHour, 1, 24, func(v int) {
		result.Performance.DHT.ScheduleEndHour = v
	})
}

func applyQueuePerformanceMerge(result *Settings, values map[string]string) {
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.ProcessTorrentConcurrency = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentBatchConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchConcurrency = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataConcurrency = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueBackfillCoverCacheConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.BackfillCoverCacheConcurrency = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueCleanupCompletedMaxRecords, 100, 1000000, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxRecords = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays, 1, 3650, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxAgeDays = v
	})
}

func applyMediaPerformanceMerge(result *Settings, values map[string]string) {
	applyParsedBool(values, runtimeconfig.KeyMediaAutoCacheCover, func(v bool) {
		result.Performance.Media.AutoCacheCover = v
	})
	applyParsedBool(values, runtimeconfig.KeyMediaAutoFetchBilingual, func(v bool) {
		result.Performance.Media.AutoFetchBilingual = v
	})

	applyParsedIntInRange(values, runtimeconfig.KeyMediaWarmupTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Media.WarmupTimeoutSeconds = v
	})
}

func applyHomeMerge(result *Settings, values map[string]string) {
	applyParsedIntInRange(values, runtimeconfig.KeyHomeDailyRefreshHour, 0, 23, func(v int) {
		result.Home.Daily.RefreshHour = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyHomeDailyPoolLimit, 24, 240, func(v int) {
		result.Home.Daily.PoolLimit = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyHomeHotDays, 1, 3650, func(v int) {
		result.Home.Hot.Days = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyHomeHighScorePoolLimit, 24, 240, func(v int) {
		result.Home.HighScore.PoolLimit = v
	})
	applyParsedFloatInRange(values, runtimeconfig.KeyHomeHighScoreMin, 0, 10, func(v float64) {
		result.Home.HighScore.MinScore = v
	})
	applyParsedFloatInRange(values, runtimeconfig.KeyHomeHighScoreMax, 0, 10, func(v float64) {
		result.Home.HighScore.MaxScore = v
	})
	applyParsedFloatInRange(values, runtimeconfig.KeyHomeHighScoreWindow, 0.0001, 10, func(v float64) {
		result.Home.HighScore.Window = v
	})

	if result.Home.HighScore.MinScore > result.Home.HighScore.MaxScore {
		result.Home.HighScore.MinScore = 8.0
		result.Home.HighScore.MaxScore = 9.9
	}
}

func applyAuthMerge(result *Settings, values map[string]string) {
	applyParsedBool(values, runtimeconfig.KeyAuthMembershipEnabled, func(v bool) {
		result.Auth.MembershipEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyAuthRegistrationEnabled, func(v bool) {
		result.Auth.RegistrationEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyAuthInviteRequired, func(v bool) {
		result.Auth.InviteRequired = v
	})
}

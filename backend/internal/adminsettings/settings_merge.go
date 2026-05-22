package adminsettings

import (
	"strconv"
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
	applyDHTPerformanceMerge(&result, values)
	applyQueuePerformanceMerge(&result, values)
	applyMediaPerformanceMerge(&result, values)
	applyHomeMerge(&result, values)
	applyPlayerMerge(&result, values)
	applyAuthMerge(&result, values)

	return result
}

func applyDHTPerformanceMerge(result *Settings, values map[string]string) {
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
		result.Performance.DHT.ScalingFactor = uint(v)
	})
	applyInt(runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds, 10, 3600, func(v int) {
		result.Performance.DHT.ReseedIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerSaveFilesThreshold, 1, 20000, func(v int) {
		result.Performance.DHT.SaveFilesThreshold = uint(v)
	})
	applyBool(runtimeconfig.KeyDHTCrawlerSavePieces, func(v bool) {
		result.Performance.DHT.SavePieces = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours, 1, 24*365, func(v int) {
		result.Performance.DHT.RescrapeThresholdHours = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds, 5, 3600, func(v int) {
		result.Performance.DHT.StatusLogIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds, 1, 600, func(v int) {
		result.Performance.DHT.GetOldestNodesIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes, 1, 24*60, func(v int) {
		result.Performance.DHT.OldPeerThresholdMinutes = v
	})
	applyBool(runtimeconfig.KeyDHTCrawlerScheduleEnabled, func(v bool) {
		result.Performance.DHT.ScheduleEnabled = v
	})
	applyWeekdays(values, runtimeconfig.KeyDHTCrawlerScheduleWeekdays, func(v []int) {
		result.Performance.DHT.ScheduleWeekdays = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerScheduleStartHour, 0, 23, func(v int) {
		result.Performance.DHT.ScheduleStartHour = v
	})
	applyInt(runtimeconfig.KeyDHTCrawlerScheduleEndHour, 1, 24, func(v int) {
		result.Performance.DHT.ScheduleEndHour = v
	})
}

func applyQueuePerformanceMerge(result *Settings, values map[string]string) {
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
		result.Performance.Queue.ProcessTorrentConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheConcurrency, 1, 128, func(v int) {
		result.Performance.Queue.BackfillCoverCacheConcurrency = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds, 1, 300, func(v int) {
		result.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyQueueCleanupCompletedMaxRecords, 100, 1000000, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxRecords = v
	})
	applyInt(runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays, 1, 3650, func(v int) {
		result.Performance.Queue.CleanupCompletedMaxAgeDays = v
	})
}

func applyMediaPerformanceMerge(result *Settings, values map[string]string) {
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

	applyBool(runtimeconfig.KeyMediaAutoCacheCover, func(v bool) {
		result.Performance.Media.AutoCacheCover = v
	})
	applyBool(runtimeconfig.KeyMediaAutoFetchBilingual, func(v bool) {
		result.Performance.Media.AutoFetchBilingual = v
	})

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
	applyInt(runtimeconfig.KeyMediaWarmupTimeoutSeconds, 5, 7200, func(v int) {
		result.Performance.Media.WarmupTimeoutSeconds = v
	})
}

func applyHomeMerge(result *Settings, values map[string]string) {
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
	applyFloat := func(key string, min, max float64, setter func(v float64)) {
		raw, ok := values[key]
		if !ok {
			return
		}
		parsed, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if err != nil || parsed < min || parsed > max {
			return
		}
		setter(parsed)
	}

	applyInt(runtimeconfig.KeyHomeDailyRefreshHour, 0, 23, func(v int) {
		result.Home.Daily.RefreshHour = v
	})
	applyInt(runtimeconfig.KeyHomeDailyPoolLimit, 24, 240, func(v int) {
		result.Home.Daily.PoolLimit = v
	})
	applyInt(runtimeconfig.KeyHomeHotDays, 1, 3650, func(v int) {
		result.Home.Hot.Days = v
	})
	applyInt(runtimeconfig.KeyHomeHighScorePoolLimit, 24, 240, func(v int) {
		result.Home.HighScore.PoolLimit = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreMin, 0, 10, func(v float64) {
		result.Home.HighScore.MinScore = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreMax, 0, 10, func(v float64) {
		result.Home.HighScore.MaxScore = v
	})
	applyFloat(runtimeconfig.KeyHomeHighScoreWindow, 0.0001, 10, func(v float64) {
		result.Home.HighScore.Window = v
	})

	if result.Home.HighScore.MinScore > result.Home.HighScore.MaxScore {
		result.Home.HighScore.MinScore = 8.0
		result.Home.HighScore.MaxScore = 9.9
	}
}

func applyAuthMerge(result *Settings, values map[string]string) {
	if raw, ok := values[runtimeconfig.KeyAuthMembershipEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.MembershipEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthRegistrationEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.RegistrationEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthInviteRequired]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Auth.InviteRequired = parsed
		}
	}
}

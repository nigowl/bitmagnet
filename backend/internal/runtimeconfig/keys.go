package runtimeconfig

import "strings"

const (
	KeySystemLogLevel = "system.log.level"

	KeyMediaTMDBEnabled = "system.media.site_plugins.tmdb.enabled"
	KeyMediaIMDbEnabled = "system.media.site_plugins.imdb.enabled"

	KeyMediaDoubanEnabled                         = "system.media.douban.enabled"
	KeyMediaDoubanMinScore                        = "system.media.douban.min_score"
	KeyMediaDoubanCookie                          = "system.media.douban.cookie"
	KeyMediaDoubanUserAgent                       = "system.media.douban.user_agent"
	KeyMediaDoubanAcceptLanguage                  = "system.media.douban.accept_language"
	KeyMediaDoubanReferer                         = "system.media.douban.referer"
	KeyMediaAutoCacheCover                        = "system.performance.media.auto_cache_cover"
	KeyMediaAutoFetchBilingual                    = "system.performance.media.auto_fetch_bilingual"
	KeyMediaWarmupTimeoutSeconds                  = "system.performance.media.warmup_timeout_seconds"
	KeyPlayerEnabled                              = "system.player.enabled"
	KeyPlayerMetadataTimeoutSeconds               = "system.player.metadata_timeout_seconds"
	KeyPlayerHardTimeoutSeconds                   = "system.player.hard_timeout_seconds"
	KeyPlayerTransmissionEnabled                  = "system.player.transmission.enabled"
	KeyPlayerTransmissionURL                      = "system.player.transmission.url"
	KeyPlayerTransmissionUsername                 = "system.player.transmission.username"
	KeyPlayerTransmissionPassword                 = "system.player.transmission.password"
	KeyPlayerTransmissionLocalDownloadDir         = "system.player.transmission.local_download_dir"
	KeyPlayerTransmissionInsecure                 = "system.player.transmission.insecure_tls"
	KeyPlayerTransmissionTimeoutSec               = "system.player.transmission.timeout_seconds"
	KeyPlayerTransmissionSequential               = "system.player.transmission.sequential_download"
	KeyPlayerTransmissionDownloadVideoFormats     = "system.player.transmission.download_video_formats"
	KeyPlayerTransmissionCleanupEnabled           = "system.player.transmission.cleanup.enabled"
	KeyPlayerTransmissionCleanupSlowTaskEnabled   = "system.player.transmission.cleanup.slow_task.enabled"
	KeyPlayerTransmissionCleanupStorageEnabled    = "system.player.transmission.cleanup.storage.enabled"
	KeyPlayerTransmissionCleanupMaxTasks          = "system.player.transmission.cleanup.max_tasks"
	KeyPlayerTransmissionCleanupMaxTotalSizeGB    = "system.player.transmission.cleanup.max_total_size_gb"
	KeyPlayerTransmissionCleanupMinFreeSpaceGB    = "system.player.transmission.cleanup.min_free_space_gb"
	KeyPlayerTransmissionCleanupSlowWindowMinutes = "system.player.transmission.cleanup.slow_window_minutes"
	KeyPlayerTransmissionCleanupSlowRateKbps      = "system.player.transmission.cleanup.slow_rate_kbps"
	KeyPlayerTransmissionCleanupDeleteData        = "system.player.transmission.cleanup.delete_data"
	KeyPlayerFFmpegEnabled                        = "system.player.ffmpeg.enabled"
	KeyPlayerFFmpegBinaryPath                     = "system.player.ffmpeg.binary_path"
	KeyPlayerFFmpegPreset                         = "system.player.ffmpeg.preset"
	KeyPlayerFFmpegCRF                            = "system.player.ffmpeg.crf"
	KeyPlayerFFmpegAudioBitrateKbps               = "system.player.ffmpeg.audio_bitrate_kbps"
	KeyPlayerFFmpegThreads                        = "system.player.ffmpeg.threads"
	KeyPlayerFFmpegExtraArgs                      = "system.player.ffmpeg.extra_args"

	KeyAuthMembershipEnabled   = "system.auth.membership.enabled"
	KeyAuthRegistrationEnabled = "system.auth.registration.enabled"
	KeyAuthInviteRequired      = "system.auth.invite.required"

	KeyHomeDailyRefreshHour   = "system.home.daily.refresh_hour"
	KeyHomeDailyPoolLimit     = "system.home.daily.pool_limit"
	KeyHomeHotDays            = "system.home.hot.days"
	KeyHomeHighScorePoolLimit = "system.home.high_score.pool_limit"
	KeyHomeHighScoreMin       = "system.home.high_score.min"
	KeyHomeHighScoreMax       = "system.home.high_score.max"
	KeyHomeHighScoreWindow    = "system.home.high_score.window"

	KeyMediaSubtitleTemplates = "system.media.subtitle.templates"

	KeyDHTCrawlerScalingFactor                       = "system.performance.dht.scaling_factor"
	KeyDHTCrawlerReseedIntervalSeconds               = "system.performance.dht.reseed_interval_seconds"
	KeyDHTCrawlerSaveFilesThreshold                  = "system.performance.dht.save_files_threshold"
	KeyDHTCrawlerSavePieces                          = "system.performance.dht.save_pieces"
	KeyDHTCrawlerRescrapeThresholdHours              = "system.performance.dht.rescrape_threshold_hours"
	KeyDHTCrawlerStatusLogIntervalSeconds            = "system.performance.dht.status_log_interval_seconds"
	KeyDHTCrawlerGetOldestNodesIntervalSeconds       = "system.performance.dht.get_oldest_nodes_interval_seconds"
	KeyDHTCrawlerOldPeerThresholdMinutes             = "system.performance.dht.old_peer_threshold_minutes"
	KeyDHTCrawlerScheduleEnabled                     = "system.performance.dht.schedule.enabled"
	KeyDHTCrawlerScheduleWeekdays                    = "system.performance.dht.schedule.weekdays"
	KeyDHTCrawlerScheduleStartHour                   = "system.performance.dht.schedule.start_hour"
	KeyDHTCrawlerScheduleEndHour                     = "system.performance.dht.schedule.end_hour"
	KeyQueueProcessTorrentConcurrency                = "system.performance.queue.process_torrent.concurrency"
	KeyQueueProcessTorrentCheckIntervalSeconds       = "system.performance.queue.process_torrent.check_interval_seconds"
	KeyQueueProcessTorrentTimeoutSeconds             = "system.performance.queue.process_torrent.timeout_seconds"
	KeyQueueProcessTorrentBatchConcurrency           = "system.performance.queue.process_torrent_batch.concurrency"
	KeyQueueProcessTorrentBatchCheckIntervalSeconds  = "system.performance.queue.process_torrent_batch.check_interval_seconds"
	KeyQueueProcessTorrentBatchTimeoutSeconds        = "system.performance.queue.process_torrent_batch.timeout_seconds"
	KeyQueueRefreshMediaMetadataConcurrency          = "system.performance.queue.refresh_media_metadata.concurrency"
	KeyQueueRefreshMediaMetadataCheckIntervalSeconds = "system.performance.queue.refresh_media_metadata.check_interval_seconds"
	KeyQueueRefreshMediaMetadataTimeoutSeconds       = "system.performance.queue.refresh_media_metadata.timeout_seconds"
	KeyQueueBackfillCoverCacheConcurrency            = "system.performance.queue.backfill_cover_cache.concurrency"
	KeyQueueBackfillCoverCacheCheckIntervalSeconds   = "system.performance.queue.backfill_cover_cache.check_interval_seconds"
	KeyQueueBackfillCoverCacheTimeoutSeconds         = "system.performance.queue.backfill_cover_cache.timeout_seconds"
	KeyQueueCleanupCompletedMaxRecords               = "system.performance.queue.cleanup.completed.max_records"
	KeyQueueCleanupCompletedMaxAgeDays               = "system.performance.queue.cleanup.completed.max_age_days"
)

func AdminEditableKeys() []string {
	return append(append([]string{
		KeySystemLogLevel,
		KeyMediaTMDBEnabled,
		KeyMediaIMDbEnabled,
		KeyMediaDoubanEnabled,
		KeyMediaDoubanMinScore,
		KeyMediaDoubanCookie,
		KeyMediaDoubanUserAgent,
		KeyMediaDoubanAcceptLanguage,
		KeyMediaDoubanReferer,
	}, PerformanceKeys()...), append(append(HomeKeys(), PlayerKeys()...), AuthKeys()...)...)
}

func DoubanKeys() []string {
	return []string{
		KeyMediaDoubanEnabled,
		KeyMediaDoubanMinScore,
		KeyMediaDoubanCookie,
		KeyMediaDoubanUserAgent,
		KeyMediaDoubanAcceptLanguage,
		KeyMediaDoubanReferer,
	}
}

func SitePluginEnabledKeys() []string {
	return []string{
		KeyMediaTMDBEnabled,
		KeyMediaIMDbEnabled,
		KeyMediaDoubanEnabled,
	}
}

func SitePluginEnabledKey(pluginKey string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(pluginKey)) {
	case "tmdb":
		return KeyMediaTMDBEnabled, true
	case "imdb":
		return KeyMediaIMDbEnabled, true
	case "douban":
		return KeyMediaDoubanEnabled, true
	default:
		return "", false
	}
}

func PerformanceKeys() []string {
	return []string{
		KeyDHTCrawlerScalingFactor,
		KeyDHTCrawlerReseedIntervalSeconds,
		KeyDHTCrawlerSaveFilesThreshold,
		KeyDHTCrawlerSavePieces,
		KeyDHTCrawlerRescrapeThresholdHours,
		KeyDHTCrawlerStatusLogIntervalSeconds,
		KeyDHTCrawlerGetOldestNodesIntervalSeconds,
		KeyDHTCrawlerOldPeerThresholdMinutes,
		KeyDHTCrawlerScheduleEnabled,
		KeyDHTCrawlerScheduleWeekdays,
		KeyDHTCrawlerScheduleStartHour,
		KeyDHTCrawlerScheduleEndHour,
		KeyQueueProcessTorrentConcurrency,
		KeyQueueProcessTorrentCheckIntervalSeconds,
		KeyQueueProcessTorrentTimeoutSeconds,
		KeyQueueProcessTorrentBatchConcurrency,
		KeyQueueProcessTorrentBatchCheckIntervalSeconds,
		KeyQueueProcessTorrentBatchTimeoutSeconds,
		KeyQueueRefreshMediaMetadataConcurrency,
		KeyQueueRefreshMediaMetadataCheckIntervalSeconds,
		KeyQueueRefreshMediaMetadataTimeoutSeconds,
		KeyQueueBackfillCoverCacheConcurrency,
		KeyQueueBackfillCoverCacheCheckIntervalSeconds,
		KeyQueueBackfillCoverCacheTimeoutSeconds,
		KeyQueueCleanupCompletedMaxRecords,
		KeyQueueCleanupCompletedMaxAgeDays,
		KeyMediaAutoCacheCover,
		KeyMediaAutoFetchBilingual,
		KeyMediaWarmupTimeoutSeconds,
	}
}

func HomeKeys() []string {
	return []string{
		KeyHomeDailyRefreshHour,
		KeyHomeDailyPoolLimit,
		KeyHomeHotDays,
		KeyHomeHighScorePoolLimit,
		KeyHomeHighScoreMin,
		KeyHomeHighScoreMax,
		KeyHomeHighScoreWindow,
	}
}

func PlayerKeys() []string {
	return []string{
		KeyPlayerEnabled,
		KeyPlayerMetadataTimeoutSeconds,
		KeyPlayerHardTimeoutSeconds,
		KeyPlayerTransmissionEnabled,
		KeyPlayerTransmissionURL,
		KeyPlayerTransmissionUsername,
		KeyPlayerTransmissionPassword,
		KeyPlayerTransmissionLocalDownloadDir,
		KeyPlayerTransmissionInsecure,
		KeyPlayerTransmissionTimeoutSec,
		KeyPlayerTransmissionSequential,
		KeyPlayerTransmissionDownloadVideoFormats,
		KeyPlayerTransmissionCleanupEnabled,
		KeyPlayerTransmissionCleanupSlowTaskEnabled,
		KeyPlayerTransmissionCleanupStorageEnabled,
		KeyPlayerTransmissionCleanupMaxTasks,
		KeyPlayerTransmissionCleanupMaxTotalSizeGB,
		KeyPlayerTransmissionCleanupMinFreeSpaceGB,
		KeyPlayerTransmissionCleanupSlowWindowMinutes,
		KeyPlayerTransmissionCleanupSlowRateKbps,
		KeyPlayerFFmpegEnabled,
		KeyPlayerFFmpegBinaryPath,
		KeyPlayerFFmpegPreset,
		KeyPlayerFFmpegCRF,
		KeyPlayerFFmpegAudioBitrateKbps,
		KeyPlayerFFmpegThreads,
		KeyPlayerFFmpegExtraArgs,
	}
}

func AuthKeys() []string {
	return []string{
		KeyAuthMembershipEnabled,
		KeyAuthRegistrationEnabled,
		KeyAuthInviteRequired,
	}
}

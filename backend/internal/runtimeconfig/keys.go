package runtimeconfig

import "strings"

const (
	KeySystemLogLevel = "system.log.level"

	KeyMediaTMDBEnabled = "system.media.site_plugins.tmdb.enabled"
	KeyMediaIMDbEnabled = "system.media.site_plugins.imdb.enabled"

	KeyMediaDoubanEnabled        = "system.media.douban.enabled"
	KeyMediaDoubanMinScore       = "system.media.douban.min_score"
	KeyMediaDoubanCookie         = "system.media.douban.cookie"
	KeyMediaDoubanUserAgent      = "system.media.douban.user_agent"
	KeyMediaDoubanAcceptLanguage = "system.media.douban.accept_language"
	KeyMediaDoubanReferer        = "system.media.douban.referer"
	KeyMediaAutoCacheCover       = "system.performance.media.auto_cache_cover"
	KeyMediaAutoFetchBilingual   = "system.performance.media.auto_fetch_bilingual"

	KeyMediaSubtitleTemplates = "system.media.subtitle.templates"

	KeyDHTCrawlerScalingFactor                       = "system.performance.dht.scaling_factor"
	KeyDHTCrawlerReseedIntervalSeconds               = "system.performance.dht.reseed_interval_seconds"
	KeyDHTCrawlerSaveFilesThreshold                  = "system.performance.dht.save_files_threshold"
	KeyDHTCrawlerSavePieces                          = "system.performance.dht.save_pieces"
	KeyDHTCrawlerRescrapeThresholdHours              = "system.performance.dht.rescrape_threshold_hours"
	KeyDHTCrawlerStatusLogIntervalSeconds            = "system.performance.dht.status_log_interval_seconds"
	KeyDHTCrawlerGetOldestNodesIntervalSeconds       = "system.performance.dht.get_oldest_nodes_interval_seconds"
	KeyDHTCrawlerOldPeerThresholdMinutes             = "system.performance.dht.old_peer_threshold_minutes"
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
)

func AdminEditableKeys() []string {
	return append([]string{
		KeySystemLogLevel,
		KeyMediaTMDBEnabled,
		KeyMediaIMDbEnabled,
		KeyMediaDoubanEnabled,
		KeyMediaDoubanMinScore,
		KeyMediaDoubanCookie,
		KeyMediaDoubanUserAgent,
		KeyMediaDoubanAcceptLanguage,
		KeyMediaDoubanReferer,
	}, PerformanceKeys()...)
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
		KeyMediaAutoCacheCover,
		KeyMediaAutoFetchBilingual,
	}
}

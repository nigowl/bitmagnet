package adminsettings

import (
	"time"

	"github.com/nigowl/bitmagnet/internal/queue"
)

func newSettingsDefaults(p Params, defaultLogLevel string) Settings {
	return Settings{
		LogLevel:             defaultLogLevel,
		TMDBEnabled:          p.MediaConfig.TMDBEnabled,
		IMDbEnabled:          p.MediaConfig.IMDbEnabled,
		DoubanEnabled:        p.MediaConfig.DoubanEnabled,
		DoubanMinScore:       p.MediaConfig.DoubanMinScore,
		DoubanCookie:         p.MediaConfig.DoubanCookie,
		DoubanUserAgent:      p.MediaConfig.DoubanUserAgent,
		DoubanAcceptLanguage: p.MediaConfig.DoubanAcceptLanguage,
		DoubanReferer:        p.MediaConfig.DoubanReferer,
		Performance: PerformanceSettings{
			DHT: DHTPerformanceSettings{
				ScalingFactor:                 p.DHTCrawlerConfig.ScalingFactor,
				ReseedIntervalSeconds:         int(p.DHTCrawlerConfig.ReseedBootstrapNodesInterval / time.Second),
				SaveFilesThreshold:            p.DHTCrawlerConfig.SaveFilesThreshold,
				SavePieces:                    p.DHTCrawlerConfig.SavePieces,
				RescrapeThresholdHours:        int(p.DHTCrawlerConfig.RescrapeThreshold / time.Hour),
				StatusLogIntervalSeconds:      int(p.DHTCrawlerConfig.StatusLogInterval / time.Second),
				GetOldestNodesIntervalSeconds: int(p.DHTCrawlerConfig.GetOldestNodesInterval / time.Second),
				OldPeerThresholdMinutes:       int(p.DHTCrawlerConfig.OldPeerThreshold / time.Minute),
				ScheduleEnabled:               p.DHTCrawlerConfig.ScheduleEnabled,
				ScheduleWeekdays:              p.DHTCrawlerConfig.ScheduleWeekdays,
				ScheduleStartHour:             p.DHTCrawlerConfig.ScheduleStartHour,
				ScheduleEndHour:               p.DHTCrawlerConfig.ScheduleEndHour,
			},
			Queue: newQueuePerformanceSettingsDefaults(queue.NewDefaultPerformanceConfig()),
			Media: MediaPerformanceSettings{
				AutoCacheCover:       true,
				AutoFetchBilingual:   true,
				WarmupTimeoutSeconds: 90,
			},
		},
		Home: HomeSettings{
			Daily: HomeDailySettings{
				RefreshHour: 2,
				PoolLimit:   96,
			},
			Hot: HomeHotSettings{
				Days: 30,
			},
			HighScore: HomeHighScoreSettings{
				PoolLimit: 120,
				MinScore:  8.0,
				MaxScore:  9.9,
				Window:    1.0,
			},
		},
		Player: PlayerSettings{
			Enabled:                true,
			MetadataTimeoutSeconds: 25,
			HardTimeoutSeconds:     45,
			Transmission: TransmissionSettings{
				Enabled:                      true,
				URL:                          "http://127.0.0.1:9091/transmission/rpc",
				LocalDownloadDir:             "",
				DownloadMappingDirectory:     "",
				DownloadVideoFormats:         defaultTransmissionVideoFormats(),
				Username:                     "",
				Password:                     "",
				InsecureTLS:                  false,
				TimeoutSeconds:               8,
				SequentialDownload:           true,
				AutoCleanupEnabled:           false,
				AutoCleanupSlowTaskEnabled:   true,
				AutoCleanupStorageEnabled:    true,
				AutoCleanupMaxTasks:          60,
				AutoCleanupMaxTotalSizeGB:    100,
				AutoCleanupMinFreeSpaceGB:    20,
				AutoCleanupSlowWindowMinutes: 30,
				AutoCleanupSlowRateKbps:      100,
			},
			FFmpeg: FFmpegSettings{
				Enabled:          true,
				BinaryPath:       "ffmpeg",
				Preset:           "veryfast",
				CRF:              23,
				AudioBitrateKbps: 128,
				Threads:          0,
				ExtraArgs:        "",
			},
		},
		Auth: AuthSettings{
			MembershipEnabled:   false,
			RegistrationEnabled: p.AuthConfig.AllowRegistration,
			InviteRequired:      false,
		},
	}
}

func defaultTransmissionVideoFormats() []string {
	return []string{
		".mp4", ".m4v", ".webm", ".mkv", ".mov", ".avi", ".flv", ".ts", ".m2ts", ".mpeg", ".mpg", ".wmv",
		".asf", ".3gp", ".3g2", ".f4v", ".rm", ".rmvb", ".vob", ".mxf", ".divx", ".xvid",
	}
}

func newQueuePerformanceSettingsDefaults(cfg queue.PerformanceConfig) QueuePerformanceSettings {
	return QueuePerformanceSettings{
		ProcessTorrentConcurrency:                cfg.ProcessTorrentConcurrency,
		ProcessTorrentCheckIntervalSeconds:       int(cfg.ProcessTorrentCheckInterval / time.Second),
		ProcessTorrentTimeoutSeconds:             int(cfg.ProcessTorrentTimeout / time.Second),
		ProcessTorrentBatchConcurrency:           cfg.ProcessTorrentBatchConcurrency,
		ProcessTorrentBatchCheckIntervalSeconds:  int(cfg.ProcessTorrentBatchCheckIntvl / time.Second),
		ProcessTorrentBatchTimeoutSeconds:        int(cfg.ProcessTorrentBatchTimeout / time.Second),
		RefreshMediaMetadataConcurrency:          cfg.RefreshMediaMetaConcurrency,
		RefreshMediaMetadataCheckIntervalSeconds: int(cfg.RefreshMediaMetaCheckInterval / time.Second),
		RefreshMediaMetadataTimeoutSeconds:       int(cfg.RefreshMediaMetaTimeout / time.Second),
		BackfillCoverCacheConcurrency:            cfg.BackfillCoverConcurrency,
		BackfillCoverCacheCheckIntervalSeconds:   int(cfg.BackfillCoverCheckInterval / time.Second),
		BackfillCoverCacheTimeoutSeconds:         int(cfg.BackfillCoverTimeout / time.Second),
		CleanupCompletedMaxRecords:               cfg.CleanupCompletedMaxRecords,
		CleanupCompletedMaxAgeDays:               cfg.CleanupCompletedMaxAgeDays,
	}
}

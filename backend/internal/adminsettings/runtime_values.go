package adminsettings

import (
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func settingsToRuntimeValueMap(settings Settings) map[string]string {
	mappingDir := strings.TrimSpace(settings.Player.Transmission.DownloadMappingDirectory)
	if mappingDir == "" {
		mappingDir = strings.TrimSpace(settings.Player.Transmission.LocalDownloadDir)
	}
	videoFormats := normalizeVideoFormatExtensions(settings.Player.Transmission.DownloadVideoFormats)

	return map[string]string{
		runtimeconfig.KeySystemLogLevel: settings.LogLevel,

		runtimeconfig.KeyMediaTMDBEnabled: strconv.FormatBool(settings.TMDBEnabled),
		runtimeconfig.KeyMediaIMDbEnabled: strconv.FormatBool(settings.IMDbEnabled),

		runtimeconfig.KeyMediaDoubanEnabled:        strconv.FormatBool(settings.DoubanEnabled),
		runtimeconfig.KeyMediaDoubanMinScore:       strconv.FormatFloat(settings.DoubanMinScore, 'f', 4, 64),
		runtimeconfig.KeyMediaDoubanCookie:         settings.DoubanCookie,
		runtimeconfig.KeyMediaDoubanUserAgent:      settings.DoubanUserAgent,
		runtimeconfig.KeyMediaDoubanAcceptLanguage: settings.DoubanAcceptLanguage,
		runtimeconfig.KeyMediaDoubanReferer:        settings.DoubanReferer,

		runtimeconfig.KeyDHTCrawlerScalingFactor:                 strconv.FormatUint(uint64(settings.Performance.DHT.ScalingFactor), 10),
		runtimeconfig.KeyDHTCrawlerReseedIntervalSeconds:         strconv.Itoa(settings.Performance.DHT.ReseedIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerSaveFilesThreshold:            strconv.FormatUint(uint64(settings.Performance.DHT.SaveFilesThreshold), 10),
		runtimeconfig.KeyDHTCrawlerSavePieces:                    strconv.FormatBool(settings.Performance.DHT.SavePieces),
		runtimeconfig.KeyDHTCrawlerRescrapeThresholdHours:        strconv.Itoa(settings.Performance.DHT.RescrapeThresholdHours),
		runtimeconfig.KeyDHTCrawlerStatusLogIntervalSeconds:      strconv.Itoa(settings.Performance.DHT.StatusLogIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerGetOldestNodesIntervalSeconds: strconv.Itoa(settings.Performance.DHT.GetOldestNodesIntervalSeconds),
		runtimeconfig.KeyDHTCrawlerOldPeerThresholdMinutes:       strconv.Itoa(settings.Performance.DHT.OldPeerThresholdMinutes),
		runtimeconfig.KeyDHTCrawlerScheduleEnabled:               strconv.FormatBool(settings.Performance.DHT.ScheduleEnabled),
		runtimeconfig.KeyDHTCrawlerScheduleWeekdays:              joinInts(settings.Performance.DHT.ScheduleWeekdays),
		runtimeconfig.KeyDHTCrawlerScheduleStartHour:             strconv.Itoa(settings.Performance.DHT.ScheduleStartHour),
		runtimeconfig.KeyDHTCrawlerScheduleEndHour:               strconv.Itoa(settings.Performance.DHT.ScheduleEndHour),

		runtimeconfig.KeyQueueProcessTorrentConcurrency:                strconv.Itoa(settings.Performance.Queue.ProcessTorrentConcurrency),
		runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds:       strconv.Itoa(settings.Performance.Queue.ProcessTorrentCheckIntervalSeconds),
		runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds:             strconv.Itoa(settings.Performance.Queue.ProcessTorrentTimeoutSeconds),
		runtimeconfig.KeyQueueProcessTorrentBatchConcurrency:           strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchConcurrency),
		runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds:  strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds),
		runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds:        strconv.Itoa(settings.Performance.Queue.ProcessTorrentBatchTimeoutSeconds),
		runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency:          strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataConcurrency),
		runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds: strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds),
		runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds:       strconv.Itoa(settings.Performance.Queue.RefreshMediaMetadataTimeoutSeconds),
		runtimeconfig.KeyQueueBackfillCoverCacheConcurrency:            strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheConcurrency),
		runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds:   strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds),
		runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds:         strconv.Itoa(settings.Performance.Queue.BackfillCoverCacheTimeoutSeconds),
		runtimeconfig.KeyQueueCleanupCompletedMaxRecords:               strconv.Itoa(settings.Performance.Queue.CleanupCompletedMaxRecords),
		runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays:               strconv.Itoa(settings.Performance.Queue.CleanupCompletedMaxAgeDays),

		runtimeconfig.KeyMediaAutoCacheCover:       strconv.FormatBool(settings.Performance.Media.AutoCacheCover),
		runtimeconfig.KeyMediaAutoFetchBilingual:   strconv.FormatBool(settings.Performance.Media.AutoFetchBilingual),
		runtimeconfig.KeyMediaWarmupTimeoutSeconds: strconv.Itoa(settings.Performance.Media.WarmupTimeoutSeconds),

		runtimeconfig.KeyHomeDailyRefreshHour:   strconv.Itoa(settings.Home.Daily.RefreshHour),
		runtimeconfig.KeyHomeDailyPoolLimit:     strconv.Itoa(settings.Home.Daily.PoolLimit),
		runtimeconfig.KeyHomeHotDays:            strconv.Itoa(settings.Home.Hot.Days),
		runtimeconfig.KeyHomeHighScorePoolLimit: strconv.Itoa(settings.Home.HighScore.PoolLimit),
		runtimeconfig.KeyHomeHighScoreMin:       strconv.FormatFloat(settings.Home.HighScore.MinScore, 'f', 4, 64),
		runtimeconfig.KeyHomeHighScoreMax:       strconv.FormatFloat(settings.Home.HighScore.MaxScore, 'f', 4, 64),
		runtimeconfig.KeyHomeHighScoreWindow:    strconv.FormatFloat(settings.Home.HighScore.Window, 'f', 4, 64),

		runtimeconfig.KeyPlayerEnabled:                              strconv.FormatBool(settings.Player.Enabled),
		runtimeconfig.KeyPlayerMetadataTimeoutSeconds:               strconv.Itoa(settings.Player.MetadataTimeoutSeconds),
		runtimeconfig.KeyPlayerHardTimeoutSeconds:                   strconv.Itoa(settings.Player.HardTimeoutSeconds),
		runtimeconfig.KeyPlayerTransmissionEnabled:                  strconv.FormatBool(settings.Player.Transmission.Enabled),
		runtimeconfig.KeyPlayerTransmissionURL:                      settings.Player.Transmission.URL,
		runtimeconfig.KeyPlayerTransmissionLocalDownloadDir:         mappingDir,
		runtimeconfig.KeyPlayerTransmissionDownloadVideoFormats:     strings.Join(videoFormats, ","),
		runtimeconfig.KeyPlayerTransmissionUsername:                 settings.Player.Transmission.Username,
		runtimeconfig.KeyPlayerTransmissionPassword:                 settings.Player.Transmission.Password,
		runtimeconfig.KeyPlayerTransmissionInsecure:                 strconv.FormatBool(settings.Player.Transmission.InsecureTLS),
		runtimeconfig.KeyPlayerTransmissionTimeoutSec:               strconv.Itoa(settings.Player.Transmission.TimeoutSeconds),
		runtimeconfig.KeyPlayerTransmissionSequential:               strconv.FormatBool(settings.Player.Transmission.SequentialDownload),
		runtimeconfig.KeyPlayerTransmissionCleanupEnabled:           strconv.FormatBool(settings.Player.Transmission.AutoCleanupEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled:   strconv.FormatBool(settings.Player.Transmission.AutoCleanupSlowTaskEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled:    strconv.FormatBool(settings.Player.Transmission.AutoCleanupStorageEnabled),
		runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks:          strconv.Itoa(settings.Player.Transmission.AutoCleanupMaxTasks),
		runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB:    strconv.Itoa(settings.Player.Transmission.AutoCleanupMaxTotalSizeGB),
		runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB:    strconv.Itoa(settings.Player.Transmission.AutoCleanupMinFreeSpaceGB),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes: strconv.Itoa(settings.Player.Transmission.AutoCleanupSlowWindowMinutes),
		runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps:      strconv.Itoa(settings.Player.Transmission.AutoCleanupSlowRateKbps),
		runtimeconfig.KeyPlayerFFmpegEnabled:                        strconv.FormatBool(settings.Player.FFmpeg.Enabled),
		runtimeconfig.KeyPlayerFFmpegBinaryPath:                     settings.Player.FFmpeg.BinaryPath,
		runtimeconfig.KeyPlayerFFmpegPreset:                         settings.Player.FFmpeg.Preset,
		runtimeconfig.KeyPlayerFFmpegCRF:                            strconv.Itoa(settings.Player.FFmpeg.CRF),
		runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps:               strconv.Itoa(settings.Player.FFmpeg.AudioBitrateKbps),
		runtimeconfig.KeyPlayerFFmpegThreads:                        strconv.Itoa(settings.Player.FFmpeg.Threads),
		runtimeconfig.KeyPlayerFFmpegExtraArgs:                      settings.Player.FFmpeg.ExtraArgs,

		runtimeconfig.KeyAuthMembershipEnabled:   strconv.FormatBool(settings.Auth.MembershipEnabled),
		runtimeconfig.KeyAuthRegistrationEnabled: strconv.FormatBool(settings.Auth.RegistrationEnabled),
		runtimeconfig.KeyAuthInviteRequired:      strconv.FormatBool(settings.Auth.InviteRequired),
	}
}

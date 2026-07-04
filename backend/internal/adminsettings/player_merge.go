package adminsettings

import (
	"strings"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func applyPlayerMerge(result *Settings, values map[string]string) {
	if raw, ok := values[runtimeconfig.KeyPlayerEnabled]; ok {
		if parsed, ok := parseTrimmedBool(raw); ok {
			result.Player.Enabled = parsed
		}
	}
	applyNonEmptyTrimmedString(values, runtimeconfig.KeyPlayerTransmissionURL, func(value string) {
		result.Player.Transmission.URL = value
	})
	applyTrimmedString(values, runtimeconfig.KeyPlayerTransmissionLocalDownloadDir, func(normalized string) {
		result.Player.Transmission.LocalDownloadDir = normalized
		result.Player.Transmission.DownloadMappingDirectory = normalized
	})
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionDownloadVideoFormats]; ok {
		normalized := normalizeVideoFormatExtensions(strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ';'
		}))
		if len(normalized) > 0 {
			result.Player.Transmission.DownloadVideoFormats = normalized
		}
	}
	applyTrimmedString(values, runtimeconfig.KeyPlayerTransmissionUsername, func(value string) {
		result.Player.Transmission.Username = value
	})
	applyTrimmedString(values, runtimeconfig.KeyPlayerTransmissionPassword, func(value string) {
		result.Player.Transmission.Password = value
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionEnabled, func(v bool) {
		result.Player.Transmission.Enabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionInsecure, func(v bool) {
		result.Player.Transmission.InsecureTLS = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionSequential, func(v bool) {
		result.Player.Transmission.SequentialDownload = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionCacheQueueEnabled, func(v bool) {
		result.Player.Transmission.CacheQueueEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionCleanupEnabled, func(v bool) {
		result.Player.Transmission.AutoCleanupEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled, func(v bool) {
		result.Player.Transmission.AutoCleanupSlowTaskEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled, func(v bool) {
		result.Player.Transmission.AutoCleanupStorageEnabled = v
	})
	applyParsedBool(values, runtimeconfig.KeyPlayerFFmpegEnabled, func(v bool) {
		result.Player.FFmpeg.Enabled = v
	})
	applyNonEmptyTrimmedString(values, runtimeconfig.KeyPlayerFFmpegBinaryPath, func(value string) {
		result.Player.FFmpeg.BinaryPath = value
	})
	applyNonEmptyTrimmedString(values, runtimeconfig.KeyPlayerFFmpegPreset, func(value string) {
		result.Player.FFmpeg.Preset = value
	})
	applyTrimmedString(values, runtimeconfig.KeyPlayerFFmpegExtraArgs, func(value string) {
		result.Player.FFmpeg.ExtraArgs = value
	})

	applyParsedIntInRange(values, runtimeconfig.KeyPlayerMetadataTimeoutSeconds, 5, 300, func(v int) {
		result.Player.MetadataTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerHardTimeoutSeconds, 10, 900, func(v int) {
		result.Player.HardTimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionTimeoutSec, 2, 60, func(v int) {
		result.Player.Transmission.TimeoutSeconds = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCacheQueueMaxActive, 1, 20, func(v int) {
		result.Player.Transmission.CacheQueueMaxActive = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCacheQueueCheckInterval, 3, 300, func(v int) {
		result.Player.Transmission.CacheQueueCheckIntervalSec = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks, 0, 5000, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTasks = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB, 0, 32768, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTotalSizeGB = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB, 0, 8192, func(v int) {
		result.Player.Transmission.AutoCleanupMinFreeSpaceGB = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes, 5, 1440, func(v int) {
		result.Player.Transmission.AutoCleanupSlowWindowMinutes = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps, 0, 102400, func(v int) {
		result.Player.Transmission.AutoCleanupSlowRateKbps = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerFFmpegCRF, 16, 38, func(v int) {
		result.Player.FFmpeg.CRF = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps, 64, 320, func(v int) {
		result.Player.FFmpeg.AudioBitrateKbps = v
	})
	applyParsedIntInRange(values, runtimeconfig.KeyPlayerFFmpegThreads, 0, 32, func(v int) {
		result.Player.FFmpeg.Threads = v
	})

	if result.Player.HardTimeoutSeconds < result.Player.MetadataTimeoutSeconds {
		result.Player.HardTimeoutSeconds = result.Player.MetadataTimeoutSeconds
	}
	if result.Player.Transmission.DownloadMappingDirectory == "" && result.Player.Transmission.LocalDownloadDir != "" {
		result.Player.Transmission.DownloadMappingDirectory = result.Player.Transmission.LocalDownloadDir
	}
	if result.Player.Transmission.LocalDownloadDir == "" && result.Player.Transmission.DownloadMappingDirectory != "" {
		result.Player.Transmission.LocalDownloadDir = result.Player.Transmission.DownloadMappingDirectory
	}
	result.Player.Transmission.Enabled = result.Player.Enabled
	result.Player.FFmpeg.Enabled = result.Player.Enabled
}

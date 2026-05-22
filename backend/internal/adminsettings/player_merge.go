package adminsettings

import (
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func applyPlayerMerge(result *Settings, values map[string]string) {
	if raw, ok := values[runtimeconfig.KeyPlayerEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionURL]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.Transmission.URL = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir]; ok {
		normalized := strings.TrimSpace(raw)
		result.Player.Transmission.LocalDownloadDir = normalized
		result.Player.Transmission.DownloadMappingDirectory = normalized
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionDownloadVideoFormats]; ok {
		normalized := normalizeVideoFormatExtensions(strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ';'
		}))
		if len(normalized) > 0 {
			result.Player.Transmission.DownloadVideoFormats = normalized
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionUsername]; ok {
		result.Player.Transmission.Username = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionPassword]; ok {
		result.Player.Transmission.Password = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionInsecure]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.InsecureTLS = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionSequential]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.SequentialDownload = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupSlowTaskEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.Transmission.AutoCleanupStorageEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegEnabled]; ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(raw)); err == nil {
			result.Player.FFmpeg.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegBinaryPath]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.FFmpeg.BinaryPath = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegPreset]; ok {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" {
			result.Player.FFmpeg.Preset = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegExtraArgs]; ok {
		result.Player.FFmpeg.ExtraArgs = strings.TrimSpace(raw)
	}

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

	applyInt(runtimeconfig.KeyPlayerMetadataTimeoutSeconds, 5, 300, func(v int) {
		result.Player.MetadataTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerHardTimeoutSeconds, 10, 900, func(v int) {
		result.Player.HardTimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionTimeoutSec, 2, 60, func(v int) {
		result.Player.Transmission.TimeoutSeconds = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks, 0, 5000, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTasks = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB, 0, 32768, func(v int) {
		result.Player.Transmission.AutoCleanupMaxTotalSizeGB = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB, 0, 8192, func(v int) {
		result.Player.Transmission.AutoCleanupMinFreeSpaceGB = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes, 5, 1440, func(v int) {
		result.Player.Transmission.AutoCleanupSlowWindowMinutes = v
	})
	applyInt(runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps, 0, 102400, func(v int) {
		result.Player.Transmission.AutoCleanupSlowRateKbps = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegCRF, 16, 38, func(v int) {
		result.Player.FFmpeg.CRF = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps, 64, 320, func(v int) {
		result.Player.FFmpeg.AudioBitrateKbps = v
	})
	applyInt(runtimeconfig.KeyPlayerFFmpegThreads, 0, 32, func(v int) {
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

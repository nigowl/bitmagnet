package adminsettings

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func applyPlayerUpdate(
	input *PlayerSettingsInput,
	effective *Settings,
	updates map[string]*string,
	defaults PlayerSettings,
) error {
	if input == nil {
		return nil
	}

	if input.Enabled != nil {
		value := strconv.FormatBool(*input.Enabled)
		updates[runtimeconfig.KeyPlayerEnabled] = &value
		effective.Player.Enabled = *input.Enabled
	}

	if input.MetadataTimeoutSeconds != nil {
		if *input.MetadataTimeoutSeconds < 5 || *input.MetadataTimeoutSeconds > 300 {
			return fmt.Errorf("%w: player.metadataTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.MetadataTimeoutSeconds)
		updates[runtimeconfig.KeyPlayerMetadataTimeoutSeconds] = &value
		effective.Player.MetadataTimeoutSeconds = *input.MetadataTimeoutSeconds
	}

	if input.HardTimeoutSeconds != nil {
		if *input.HardTimeoutSeconds < 10 || *input.HardTimeoutSeconds > 900 {
			return fmt.Errorf("%w: player.hardTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.HardTimeoutSeconds)
		updates[runtimeconfig.KeyPlayerHardTimeoutSeconds] = &value
		effective.Player.HardTimeoutSeconds = *input.HardTimeoutSeconds
	}

	if effective.Player.HardTimeoutSeconds < effective.Player.MetadataTimeoutSeconds {
		return fmt.Errorf("%w: player.hardTimeoutSeconds", ErrInvalidInput)
	}

	if input.Transmission != nil {
		if input.Transmission.URL != nil {
			normalized := strings.TrimSpace(*input.Transmission.URL)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionURL] = nil
				effective.Player.Transmission.URL = defaults.Transmission.URL
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionURL] = &normalized
				effective.Player.Transmission.URL = normalized
			}
		}
		if input.Transmission.LocalDownloadDir != nil {
			normalized := strings.TrimSpace(*input.Transmission.LocalDownloadDir)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = nil
				effective.Player.Transmission.LocalDownloadDir = defaults.Transmission.LocalDownloadDir
				effective.Player.Transmission.DownloadMappingDirectory = defaults.Transmission.DownloadMappingDirectory
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = &normalized
				effective.Player.Transmission.LocalDownloadDir = normalized
				effective.Player.Transmission.DownloadMappingDirectory = normalized
			}
		}
		if input.Transmission.DownloadMappingDirectory != nil {
			normalized := strings.TrimSpace(*input.Transmission.DownloadMappingDirectory)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = nil
				effective.Player.Transmission.LocalDownloadDir = defaults.Transmission.LocalDownloadDir
				effective.Player.Transmission.DownloadMappingDirectory = defaults.Transmission.DownloadMappingDirectory
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = &normalized
				effective.Player.Transmission.LocalDownloadDir = normalized
				effective.Player.Transmission.DownloadMappingDirectory = normalized
			}
		}
		if input.Transmission.DownloadVideoFormats != nil {
			normalized := normalizeVideoFormatExtensions(*input.Transmission.DownloadVideoFormats)
			if len(normalized) == 0 {
				updates[runtimeconfig.KeyPlayerTransmissionDownloadVideoFormats] = nil
				effective.Player.Transmission.DownloadVideoFormats = append([]string(nil), defaults.Transmission.DownloadVideoFormats...)
			} else {
				value := strings.Join(normalized, ",")
				updates[runtimeconfig.KeyPlayerTransmissionDownloadVideoFormats] = &value
				effective.Player.Transmission.DownloadVideoFormats = normalized
			}
		}
		if input.Transmission.Username != nil {
			normalized := strings.TrimSpace(*input.Transmission.Username)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionUsername] = nil
				effective.Player.Transmission.Username = defaults.Transmission.Username
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionUsername] = &normalized
				effective.Player.Transmission.Username = normalized
			}
		}
		if input.Transmission.Password != nil {
			normalized := strings.TrimSpace(*input.Transmission.Password)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerTransmissionPassword] = nil
				effective.Player.Transmission.Password = defaults.Transmission.Password
			} else {
				updates[runtimeconfig.KeyPlayerTransmissionPassword] = &normalized
				effective.Player.Transmission.Password = normalized
			}
		}
		if input.Transmission.InsecureTLS != nil {
			value := strconv.FormatBool(*input.Transmission.InsecureTLS)
			updates[runtimeconfig.KeyPlayerTransmissionInsecure] = &value
			effective.Player.Transmission.InsecureTLS = *input.Transmission.InsecureTLS
		}
		if input.Transmission.TimeoutSeconds != nil {
			if *input.Transmission.TimeoutSeconds < 2 || *input.Transmission.TimeoutSeconds > 60 {
				return fmt.Errorf("%w: player.transmission.timeoutSeconds", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.TimeoutSeconds)
			updates[runtimeconfig.KeyPlayerTransmissionTimeoutSec] = &value
			effective.Player.Transmission.TimeoutSeconds = *input.Transmission.TimeoutSeconds
		}
		if input.Transmission.SequentialDownload != nil {
			value := strconv.FormatBool(*input.Transmission.SequentialDownload)
			updates[runtimeconfig.KeyPlayerTransmissionSequential] = &value
			effective.Player.Transmission.SequentialDownload = *input.Transmission.SequentialDownload
		}
		if input.Transmission.AutoCleanupEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupEnabled] = &value
			effective.Player.Transmission.AutoCleanupEnabled = *input.Transmission.AutoCleanupEnabled
		}
		if input.Transmission.AutoCleanupSlowTaskEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupSlowTaskEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled] = &value
			effective.Player.Transmission.AutoCleanupSlowTaskEnabled = *input.Transmission.AutoCleanupSlowTaskEnabled
		}
		if input.Transmission.AutoCleanupStorageEnabled != nil {
			value := strconv.FormatBool(*input.Transmission.AutoCleanupStorageEnabled)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled] = &value
			effective.Player.Transmission.AutoCleanupStorageEnabled = *input.Transmission.AutoCleanupStorageEnabled
		}
		if input.Transmission.AutoCleanupMaxTasks != nil {
			if *input.Transmission.AutoCleanupMaxTasks < 0 || *input.Transmission.AutoCleanupMaxTasks > 5000 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMaxTasks", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMaxTasks)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks] = &value
			effective.Player.Transmission.AutoCleanupMaxTasks = *input.Transmission.AutoCleanupMaxTasks
		}
		if input.Transmission.AutoCleanupMaxTotalSizeGB != nil {
			if *input.Transmission.AutoCleanupMaxTotalSizeGB < 0 || *input.Transmission.AutoCleanupMaxTotalSizeGB > 32768 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMaxTotalSizeGB", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMaxTotalSizeGB)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB] = &value
			effective.Player.Transmission.AutoCleanupMaxTotalSizeGB = *input.Transmission.AutoCleanupMaxTotalSizeGB
		}
		if input.Transmission.AutoCleanupMinFreeSpaceGB != nil {
			if *input.Transmission.AutoCleanupMinFreeSpaceGB < 0 || *input.Transmission.AutoCleanupMinFreeSpaceGB > 8192 {
				return fmt.Errorf("%w: player.transmission.autoCleanupMinFreeSpaceGB", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupMinFreeSpaceGB)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB] = &value
			effective.Player.Transmission.AutoCleanupMinFreeSpaceGB = *input.Transmission.AutoCleanupMinFreeSpaceGB
		}
		if input.Transmission.AutoCleanupSlowWindowMinutes != nil {
			if *input.Transmission.AutoCleanupSlowWindowMinutes < 5 || *input.Transmission.AutoCleanupSlowWindowMinutes > 1440 {
				return fmt.Errorf("%w: player.transmission.autoCleanupSlowWindowMinutes", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupSlowWindowMinutes)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes] = &value
			effective.Player.Transmission.AutoCleanupSlowWindowMinutes = *input.Transmission.AutoCleanupSlowWindowMinutes
		}
		if input.Transmission.AutoCleanupSlowRateKbps != nil {
			if *input.Transmission.AutoCleanupSlowRateKbps < 0 || *input.Transmission.AutoCleanupSlowRateKbps > 102400 {
				return fmt.Errorf("%w: player.transmission.autoCleanupSlowRateKbps", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.AutoCleanupSlowRateKbps)
			updates[runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps] = &value
			effective.Player.Transmission.AutoCleanupSlowRateKbps = *input.Transmission.AutoCleanupSlowRateKbps
		}
	}

	if input.FFmpeg != nil {
		if input.FFmpeg.BinaryPath != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.BinaryPath)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegBinaryPath] = nil
				effective.Player.FFmpeg.BinaryPath = defaults.FFmpeg.BinaryPath
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegBinaryPath] = &normalized
				effective.Player.FFmpeg.BinaryPath = normalized
			}
		}
		if input.FFmpeg.Preset != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.Preset)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegPreset] = nil
				effective.Player.FFmpeg.Preset = defaults.FFmpeg.Preset
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegPreset] = &normalized
				effective.Player.FFmpeg.Preset = normalized
			}
		}
		if input.FFmpeg.CRF != nil {
			if *input.FFmpeg.CRF < 16 || *input.FFmpeg.CRF > 38 {
				return fmt.Errorf("%w: player.ffmpeg.crf", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.CRF)
			updates[runtimeconfig.KeyPlayerFFmpegCRF] = &value
			effective.Player.FFmpeg.CRF = *input.FFmpeg.CRF
		}
		if input.FFmpeg.AudioBitrateKbps != nil {
			if *input.FFmpeg.AudioBitrateKbps < 64 || *input.FFmpeg.AudioBitrateKbps > 320 {
				return fmt.Errorf("%w: player.ffmpeg.audioBitrateKbps", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.AudioBitrateKbps)
			updates[runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps] = &value
			effective.Player.FFmpeg.AudioBitrateKbps = *input.FFmpeg.AudioBitrateKbps
		}
		if input.FFmpeg.Threads != nil {
			if *input.FFmpeg.Threads < 0 || *input.FFmpeg.Threads > 32 {
				return fmt.Errorf("%w: player.ffmpeg.threads", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.FFmpeg.Threads)
			updates[runtimeconfig.KeyPlayerFFmpegThreads] = &value
			effective.Player.FFmpeg.Threads = *input.FFmpeg.Threads
		}
		if input.FFmpeg.ExtraArgs != nil {
			normalized := strings.TrimSpace(*input.FFmpeg.ExtraArgs)
			if normalized == "" {
				updates[runtimeconfig.KeyPlayerFFmpegExtraArgs] = nil
				effective.Player.FFmpeg.ExtraArgs = defaults.FFmpeg.ExtraArgs
			} else {
				updates[runtimeconfig.KeyPlayerFFmpegExtraArgs] = &normalized
				effective.Player.FFmpeg.ExtraArgs = normalized
			}
		}
	}

	requiredEnabled := effective.Player.Enabled
	if effective.Player.Transmission.Enabled != requiredEnabled {
		value := strconv.FormatBool(requiredEnabled)
		updates[runtimeconfig.KeyPlayerTransmissionEnabled] = &value
		effective.Player.Transmission.Enabled = requiredEnabled
	}
	if effective.Player.FFmpeg.Enabled != requiredEnabled {
		value := strconv.FormatBool(requiredEnabled)
		updates[runtimeconfig.KeyPlayerFFmpegEnabled] = &value
		effective.Player.FFmpeg.Enabled = requiredEnabled
	}

	return nil
}

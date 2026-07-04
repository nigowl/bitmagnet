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

	applyTransmissionDownloadDir := func(inputValue *string) {
		if inputValue == nil {
			return
		}
		normalized := strings.TrimSpace(*inputValue)
		if normalized == "" {
			updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = nil
			effective.Player.Transmission.LocalDownloadDir = defaults.Transmission.LocalDownloadDir
			effective.Player.Transmission.DownloadMappingDirectory = defaults.Transmission.DownloadMappingDirectory
			return
		}
		updates[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir] = &normalized
		effective.Player.Transmission.LocalDownloadDir = normalized
		effective.Player.Transmission.DownloadMappingDirectory = normalized
	}

	applyOptionalBoolUpdate(input.Enabled, runtimeconfig.KeyPlayerEnabled, updates, func(value bool) {
		effective.Player.Enabled = value
	})

	if err := applyOptionalIntUpdate(
		input.MetadataTimeoutSeconds, 5, 300, runtimeconfig.KeyPlayerMetadataTimeoutSeconds,
		"player.metadataTimeoutSeconds", updates,
		func(value int) { effective.Player.MetadataTimeoutSeconds = value },
	); err != nil {
		return err
	}

	if err := applyOptionalIntUpdate(
		input.HardTimeoutSeconds, 10, 900, runtimeconfig.KeyPlayerHardTimeoutSeconds,
		"player.hardTimeoutSeconds", updates,
		func(value int) { effective.Player.HardTimeoutSeconds = value },
	); err != nil {
		return err
	}

	if effective.Player.HardTimeoutSeconds < effective.Player.MetadataTimeoutSeconds {
		return fmt.Errorf("%w: player.hardTimeoutSeconds", ErrInvalidInput)
	}

	if input.Transmission != nil {
		applyOptionalTrimmedStringUpdate(
			input.Transmission.URL,
			runtimeconfig.KeyPlayerTransmissionURL,
			defaults.Transmission.URL,
			updates,
			func(value string) { effective.Player.Transmission.URL = value },
		)
		applyTransmissionDownloadDir(input.Transmission.LocalDownloadDir)
		applyTransmissionDownloadDir(input.Transmission.DownloadMappingDirectory)
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
		applyOptionalTrimmedStringUpdate(
			input.Transmission.Username,
			runtimeconfig.KeyPlayerTransmissionUsername,
			defaults.Transmission.Username,
			updates,
			func(value string) { effective.Player.Transmission.Username = value },
		)
		applyOptionalTrimmedStringUpdate(
			input.Transmission.Password,
			runtimeconfig.KeyPlayerTransmissionPassword,
			defaults.Transmission.Password,
			updates,
			func(value string) { effective.Player.Transmission.Password = value },
		)
		applyOptionalBoolUpdate(input.Transmission.InsecureTLS, runtimeconfig.KeyPlayerTransmissionInsecure, updates, func(value bool) {
			effective.Player.Transmission.InsecureTLS = value
		})
		if input.Transmission.TimeoutSeconds != nil {
			if !validTransmissionTimeoutSeconds(*input.Transmission.TimeoutSeconds) {
				return fmt.Errorf("%w: player.transmission.timeoutSeconds", ErrInvalidInput)
			}
			value := strconv.Itoa(*input.Transmission.TimeoutSeconds)
			updates[runtimeconfig.KeyPlayerTransmissionTimeoutSec] = &value
			effective.Player.Transmission.TimeoutSeconds = *input.Transmission.TimeoutSeconds
		}
		applyOptionalBoolUpdate(input.Transmission.SequentialDownload, runtimeconfig.KeyPlayerTransmissionSequential, updates, func(value bool) {
			effective.Player.Transmission.SequentialDownload = value
		})
		applyOptionalBoolUpdate(input.Transmission.CacheQueueEnabled, runtimeconfig.KeyPlayerTransmissionCacheQueueEnabled, updates, func(value bool) {
			effective.Player.Transmission.CacheQueueEnabled = value
		})
		if err := applyOptionalIntUpdate(
			input.Transmission.CacheQueueMaxActive, 1, 20, runtimeconfig.KeyPlayerTransmissionCacheQueueMaxActive,
			"player.transmission.cacheQueueMaxActive", updates,
			func(value int) { effective.Player.Transmission.CacheQueueMaxActive = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.Transmission.CacheQueueCheckIntervalSec, 3, 300, runtimeconfig.KeyPlayerTransmissionCacheQueueCheckInterval,
			"player.transmission.cacheQueueCheckIntervalSeconds", updates,
			func(value int) { effective.Player.Transmission.CacheQueueCheckIntervalSec = value },
		); err != nil {
			return err
		}
		applyOptionalBoolUpdate(input.Transmission.AutoCleanupEnabled, runtimeconfig.KeyPlayerTransmissionCleanupEnabled, updates, func(value bool) {
			effective.Player.Transmission.AutoCleanupEnabled = value
		})
		applyOptionalBoolUpdate(input.Transmission.AutoCleanupSlowTaskEnabled, runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled, updates, func(value bool) {
			effective.Player.Transmission.AutoCleanupSlowTaskEnabled = value
		})
		applyOptionalBoolUpdate(input.Transmission.AutoCleanupStorageEnabled, runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled, updates, func(value bool) {
			effective.Player.Transmission.AutoCleanupStorageEnabled = value
		})
		if err := applyOptionalIntUpdate(
			input.Transmission.AutoCleanupMaxTasks, 0, 5000, runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks,
			"player.transmission.autoCleanupMaxTasks", updates,
			func(value int) { effective.Player.Transmission.AutoCleanupMaxTasks = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.Transmission.AutoCleanupMaxTotalSizeGB, 0, 32768, runtimeconfig.KeyPlayerTransmissionCleanupMaxTotalSizeGB,
			"player.transmission.autoCleanupMaxTotalSizeGB", updates,
			func(value int) { effective.Player.Transmission.AutoCleanupMaxTotalSizeGB = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.Transmission.AutoCleanupMinFreeSpaceGB, 0, 8192, runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB,
			"player.transmission.autoCleanupMinFreeSpaceGB", updates,
			func(value int) { effective.Player.Transmission.AutoCleanupMinFreeSpaceGB = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.Transmission.AutoCleanupSlowWindowMinutes, 5, 1440, runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes,
			"player.transmission.autoCleanupSlowWindowMinutes", updates,
			func(value int) { effective.Player.Transmission.AutoCleanupSlowWindowMinutes = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.Transmission.AutoCleanupSlowRateKbps, 0, 102400, runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps,
			"player.transmission.autoCleanupSlowRateKbps", updates,
			func(value int) { effective.Player.Transmission.AutoCleanupSlowRateKbps = value },
		); err != nil {
			return err
		}
	}

	if input.FFmpeg != nil {
		applyOptionalTrimmedStringUpdate(
			input.FFmpeg.BinaryPath,
			runtimeconfig.KeyPlayerFFmpegBinaryPath,
			defaults.FFmpeg.BinaryPath,
			updates,
			func(value string) { effective.Player.FFmpeg.BinaryPath = value },
		)
		applyOptionalTrimmedStringUpdate(
			input.FFmpeg.Preset,
			runtimeconfig.KeyPlayerFFmpegPreset,
			defaults.FFmpeg.Preset,
			updates,
			func(value string) { effective.Player.FFmpeg.Preset = value },
		)
		if err := applyOptionalIntUpdate(
			input.FFmpeg.CRF, 16, 38, runtimeconfig.KeyPlayerFFmpegCRF,
			"player.ffmpeg.crf", updates,
			func(value int) { effective.Player.FFmpeg.CRF = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.FFmpeg.AudioBitrateKbps, 64, 320, runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps,
			"player.ffmpeg.audioBitrateKbps", updates,
			func(value int) { effective.Player.FFmpeg.AudioBitrateKbps = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			input.FFmpeg.Threads, 0, 32, runtimeconfig.KeyPlayerFFmpegThreads,
			"player.ffmpeg.threads", updates,
			func(value int) { effective.Player.FFmpeg.Threads = value },
		); err != nil {
			return err
		}
		applyOptionalTrimmedStringUpdate(
			input.FFmpeg.ExtraArgs,
			runtimeconfig.KeyPlayerFFmpegExtraArgs,
			defaults.FFmpeg.ExtraArgs,
			updates,
			func(value string) { effective.Player.FFmpeg.ExtraArgs = value },
		)
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

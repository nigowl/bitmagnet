package adminsettings

import (
	"fmt"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
)

func ptr(value string) *string {
	return &value
}

func applyQueuePerformanceUpdate(
	input *QueuePerformanceSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentConcurrency,
		"performance.queue.processTorrentConcurrency", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentConcurrency = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds,
		"performance.queue.processTorrentCheckIntervalSeconds", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds,
		"performance.queue.processTorrentTimeoutSeconds", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentTimeoutSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentBatchConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentBatchConcurrency,
		"performance.queue.processTorrentBatchConcurrency", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchConcurrency = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentBatchCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds,
		"performance.queue.processTorrentBatchCheckIntervalSeconds", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.ProcessTorrentBatchTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds,
		"performance.queue.processTorrentBatchTimeoutSeconds", updates,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.RefreshMediaMetadataConcurrency, 1, 128, runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency,
		"performance.queue.refreshMediaMetadataConcurrency", updates,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataConcurrency = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.RefreshMediaMetadataCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds,
		"performance.queue.refreshMediaMetadataCheckIntervalSeconds", updates,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.RefreshMediaMetadataTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds,
		"performance.queue.refreshMediaMetadataTimeoutSeconds", updates,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.BackfillCoverCacheConcurrency, 1, 128, runtimeconfig.KeyQueueBackfillCoverCacheConcurrency,
		"performance.queue.backfillCoverCacheConcurrency", updates,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheConcurrency = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.BackfillCoverCacheCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds,
		"performance.queue.backfillCoverCacheCheckIntervalSeconds", updates,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.BackfillCoverCacheTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds,
		"performance.queue.backfillCoverCacheTimeoutSeconds", updates,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.CleanupCompletedMaxRecords, 100, 1000000, runtimeconfig.KeyQueueCleanupCompletedMaxRecords,
		"performance.queue.cleanupCompletedMaxRecords", updates,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxRecords = v },
	); err != nil {
		return err
	}
	if err := applyOptionalIntUpdate(
		input.CleanupCompletedMaxAgeDays, 1, 3650, runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays,
		"performance.queue.cleanupCompletedMaxAgeDays", updates,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxAgeDays = v },
	); err != nil {
		return err
	}

	return nil
}

func applyMediaPerformanceUpdate(
	input *MediaPerformanceSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	applyOptionalBoolUpdate(input.AutoCacheCover, runtimeconfig.KeyMediaAutoCacheCover, updates, func(value bool) {
		effective.Performance.Media.AutoCacheCover = value
	})
	applyOptionalBoolUpdate(input.AutoFetchBilingual, runtimeconfig.KeyMediaAutoFetchBilingual, updates, func(value bool) {
		effective.Performance.Media.AutoFetchBilingual = value
	})
	return applyOptionalIntUpdate(
		input.WarmupTimeoutSeconds, 5, 7200, runtimeconfig.KeyMediaWarmupTimeoutSeconds,
		"performance.media.warmupTimeoutSeconds", updates,
		func(value int) { effective.Performance.Media.WarmupTimeoutSeconds = value },
	)
}

func applyHomeUpdate(
	input *HomeSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	if input == nil {
		return nil
	}

	if daily := input.Daily; daily != nil {
		if err := applyOptionalIntUpdate(
			daily.RefreshHour, 0, 23, runtimeconfig.KeyHomeDailyRefreshHour,
			"home.daily.refreshHour", updates,
			func(value int) { effective.Home.Daily.RefreshHour = value },
		); err != nil {
			return err
		}
		if err := applyOptionalIntUpdate(
			daily.PoolLimit, 24, 240, runtimeconfig.KeyHomeDailyPoolLimit,
			"home.daily.poolLimit", updates,
			func(value int) { effective.Home.Daily.PoolLimit = value },
		); err != nil {
			return err
		}
	}

	if hot := input.Hot; hot != nil {
		if err := applyOptionalIntUpdate(
			hot.Days, 1, 3650, runtimeconfig.KeyHomeHotDays,
			"home.hot.days", updates,
			func(value int) { effective.Home.Hot.Days = value },
		); err != nil {
			return err
		}
	}

	if high := input.HighScore; high != nil {
		if err := applyOptionalIntUpdate(
			high.PoolLimit, 24, 240, runtimeconfig.KeyHomeHighScorePoolLimit,
			"home.highScore.poolLimit", updates,
			func(value int) { effective.Home.HighScore.PoolLimit = value },
		); err != nil {
			return err
		}
		if err := applyOptionalFloatUpdate(
			high.MinScore, runtimeconfig.KeyHomeHighScoreMin, "home.highScore.minScore", updates,
			func(value float64) bool { return value >= 0 && value <= 10 },
			func(value float64) { effective.Home.HighScore.MinScore = value },
		); err != nil {
			return err
		}
		if err := applyOptionalFloatUpdate(
			high.MaxScore, runtimeconfig.KeyHomeHighScoreMax, "home.highScore.maxScore", updates,
			func(value float64) bool { return value >= 0 && value <= 10 },
			func(value float64) { effective.Home.HighScore.MaxScore = value },
		); err != nil {
			return err
		}
		if err := applyOptionalFloatUpdate(
			high.Window, runtimeconfig.KeyHomeHighScoreWindow, "home.highScore.window", updates,
			func(value float64) bool { return value > 0 && value <= 10 },
			func(value float64) { effective.Home.HighScore.Window = value },
		); err != nil {
			return err
		}
	}

	if effective.Home.HighScore.MinScore > effective.Home.HighScore.MaxScore {
		return fmt.Errorf("%w: home.highScore.minScore", ErrInvalidInput)
	}

	return nil
}

func applyAuthUpdate(
	input *AuthSettingsInput,
	effective *Settings,
	updates map[string]*string,
) error {
	if input == nil {
		return nil
	}
	applyOptionalBoolUpdate(input.MembershipEnabled, runtimeconfig.KeyAuthMembershipEnabled, updates, func(value bool) {
		effective.Auth.MembershipEnabled = value
	})
	applyOptionalBoolUpdate(input.RegistrationEnabled, runtimeconfig.KeyAuthRegistrationEnabled, updates, func(value bool) {
		effective.Auth.RegistrationEnabled = value
	})
	applyOptionalBoolUpdate(input.InviteRequired, runtimeconfig.KeyAuthInviteRequired, updates, func(value bool) {
		effective.Auth.InviteRequired = value
	})
	return nil
}

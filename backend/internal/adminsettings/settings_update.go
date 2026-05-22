package adminsettings

import (
	"fmt"
	"strconv"

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
	setInt := func(field *int, min, max int, key string, setter func(v int), label string) error {
		if field == nil {
			return nil
		}
		if *field < min || *field > max {
			return fmt.Errorf("%w: %s", ErrInvalidInput, label)
		}
		value := strconv.Itoa(*field)
		updates[key] = &value
		setter(*field)
		return nil
	}

	if err := setInt(
		input.ProcessTorrentConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentConcurrency,
		func(v int) { effective.Performance.Queue.ProcessTorrentConcurrency = v },
		"performance.queue.processTorrentConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentCheckIntervalSeconds = v },
		"performance.queue.processTorrentCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentTimeoutSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentTimeoutSeconds = v },
		"performance.queue.processTorrentTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchConcurrency, 1, 128, runtimeconfig.KeyQueueProcessTorrentBatchConcurrency,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchConcurrency = v },
		"performance.queue.processTorrentBatchConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueProcessTorrentBatchCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchCheckIntervalSeconds = v },
		"performance.queue.processTorrentBatchCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.ProcessTorrentBatchTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueProcessTorrentBatchTimeoutSeconds,
		func(v int) { effective.Performance.Queue.ProcessTorrentBatchTimeoutSeconds = v },
		"performance.queue.processTorrentBatchTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataConcurrency, 1, 128, runtimeconfig.KeyQueueRefreshMediaMetadataConcurrency,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataConcurrency = v },
		"performance.queue.refreshMediaMetadataConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueRefreshMediaMetadataCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataCheckIntervalSeconds = v },
		"performance.queue.refreshMediaMetadataCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.RefreshMediaMetadataTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueRefreshMediaMetadataTimeoutSeconds,
		func(v int) { effective.Performance.Queue.RefreshMediaMetadataTimeoutSeconds = v },
		"performance.queue.refreshMediaMetadataTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheConcurrency, 1, 128, runtimeconfig.KeyQueueBackfillCoverCacheConcurrency,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheConcurrency = v },
		"performance.queue.backfillCoverCacheConcurrency",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheCheckIntervalSeconds, 1, 300, runtimeconfig.KeyQueueBackfillCoverCacheCheckIntervalSeconds,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheCheckIntervalSeconds = v },
		"performance.queue.backfillCoverCacheCheckIntervalSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.BackfillCoverCacheTimeoutSeconds, 5, 7200, runtimeconfig.KeyQueueBackfillCoverCacheTimeoutSeconds,
		func(v int) { effective.Performance.Queue.BackfillCoverCacheTimeoutSeconds = v },
		"performance.queue.backfillCoverCacheTimeoutSeconds",
	); err != nil {
		return err
	}
	if err := setInt(
		input.CleanupCompletedMaxRecords, 100, 1000000, runtimeconfig.KeyQueueCleanupCompletedMaxRecords,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxRecords = v },
		"performance.queue.cleanupCompletedMaxRecords",
	); err != nil {
		return err
	}
	if err := setInt(
		input.CleanupCompletedMaxAgeDays, 1, 3650, runtimeconfig.KeyQueueCleanupCompletedMaxAgeDays,
		func(v int) { effective.Performance.Queue.CleanupCompletedMaxAgeDays = v },
		"performance.queue.cleanupCompletedMaxAgeDays",
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
	if input.AutoCacheCover != nil {
		value := strconv.FormatBool(*input.AutoCacheCover)
		updates[runtimeconfig.KeyMediaAutoCacheCover] = &value
		effective.Performance.Media.AutoCacheCover = *input.AutoCacheCover
	}

	if input.AutoFetchBilingual != nil {
		value := strconv.FormatBool(*input.AutoFetchBilingual)
		updates[runtimeconfig.KeyMediaAutoFetchBilingual] = &value
		effective.Performance.Media.AutoFetchBilingual = *input.AutoFetchBilingual
	}

	if input.WarmupTimeoutSeconds != nil {
		if *input.WarmupTimeoutSeconds < 5 || *input.WarmupTimeoutSeconds > 7200 {
			return fmt.Errorf("%w: performance.media.warmupTimeoutSeconds", ErrInvalidInput)
		}
		value := strconv.Itoa(*input.WarmupTimeoutSeconds)
		updates[runtimeconfig.KeyMediaWarmupTimeoutSeconds] = &value
		effective.Performance.Media.WarmupTimeoutSeconds = *input.WarmupTimeoutSeconds
	}

	return nil
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
		if daily.RefreshHour != nil {
			if *daily.RefreshHour < 0 || *daily.RefreshHour > 23 {
				return fmt.Errorf("%w: home.daily.refreshHour", ErrInvalidInput)
			}
			value := strconv.Itoa(*daily.RefreshHour)
			updates[runtimeconfig.KeyHomeDailyRefreshHour] = &value
			effective.Home.Daily.RefreshHour = *daily.RefreshHour
		}
		if daily.PoolLimit != nil {
			if *daily.PoolLimit < 24 || *daily.PoolLimit > 240 {
				return fmt.Errorf("%w: home.daily.poolLimit", ErrInvalidInput)
			}
			value := strconv.Itoa(*daily.PoolLimit)
			updates[runtimeconfig.KeyHomeDailyPoolLimit] = &value
			effective.Home.Daily.PoolLimit = *daily.PoolLimit
		}
	}

	if hot := input.Hot; hot != nil {
		if hot.Days != nil {
			if *hot.Days < 1 || *hot.Days > 3650 {
				return fmt.Errorf("%w: home.hot.days", ErrInvalidInput)
			}
			value := strconv.Itoa(*hot.Days)
			updates[runtimeconfig.KeyHomeHotDays] = &value
			effective.Home.Hot.Days = *hot.Days
		}
	}

	if high := input.HighScore; high != nil {
		if high.PoolLimit != nil {
			if *high.PoolLimit < 24 || *high.PoolLimit > 240 {
				return fmt.Errorf("%w: home.highScore.poolLimit", ErrInvalidInput)
			}
			value := strconv.Itoa(*high.PoolLimit)
			updates[runtimeconfig.KeyHomeHighScorePoolLimit] = &value
			effective.Home.HighScore.PoolLimit = *high.PoolLimit
		}
		if high.MinScore != nil {
			if *high.MinScore < 0 || *high.MinScore > 10 {
				return fmt.Errorf("%w: home.highScore.minScore", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.MinScore, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreMin] = &value
			effective.Home.HighScore.MinScore = *high.MinScore
		}
		if high.MaxScore != nil {
			if *high.MaxScore < 0 || *high.MaxScore > 10 {
				return fmt.Errorf("%w: home.highScore.maxScore", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.MaxScore, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreMax] = &value
			effective.Home.HighScore.MaxScore = *high.MaxScore
		}
		if high.Window != nil {
			if *high.Window <= 0 || *high.Window > 10 {
				return fmt.Errorf("%w: home.highScore.window", ErrInvalidInput)
			}
			value := strconv.FormatFloat(*high.Window, 'f', 4, 64)
			updates[runtimeconfig.KeyHomeHighScoreWindow] = &value
			effective.Home.HighScore.Window = *high.Window
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
	if input.MembershipEnabled != nil {
		value := strconv.FormatBool(*input.MembershipEnabled)
		updates[runtimeconfig.KeyAuthMembershipEnabled] = &value
		effective.Auth.MembershipEnabled = *input.MembershipEnabled
	}
	if input.RegistrationEnabled != nil {
		value := strconv.FormatBool(*input.RegistrationEnabled)
		updates[runtimeconfig.KeyAuthRegistrationEnabled] = &value
		effective.Auth.RegistrationEnabled = *input.RegistrationEnabled
	}
	if input.InviteRequired != nil {
		value := strconv.FormatBool(*input.InviteRequired)
		updates[runtimeconfig.KeyAuthInviteRequired] = &value
		effective.Auth.InviteRequired = *input.InviteRequired
	}
	return nil
}

package adminsettings

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *service) ListPlayerTransmissionTasks(ctx context.Context) ([]TransmissionTask, error) {
	cfg, err := s.loadTransmissionSettings(ctx)
	if err != nil {
		return nil, err
	}
	items, err := s.loadTransmissionTaskItems(ctx, cfg)
	if err != nil {
		return nil, err
	}
	tasks := make([]TransmissionTask, 0, len(items))
	for _, item := range items {
		tasks = append(tasks, mapTransmissionTask(item))
	}
	sort.Slice(tasks, func(i, j int) bool {
		if tasks[i].ActivityAtUnix == tasks[j].ActivityAtUnix {
			return tasks[i].ID > tasks[j].ID
		}
		return tasks[i].ActivityAtUnix > tasks[j].ActivityAtUnix
	})
	return tasks, nil
}

func (s *service) GetPlayerTransmissionTaskStats(ctx context.Context) (TransmissionTaskStats, error) {
	cfg, err := s.loadTransmissionSettings(ctx)
	if err != nil {
		return TransmissionTaskStats{}, err
	}
	items, err := s.loadTransmissionTaskItems(ctx, cfg)
	if err != nil {
		return TransmissionTaskStats{}, err
	}

	totalSizeBytes := int64(0)
	for _, item := range items {
		totalSizeBytes += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
	}

	stats := TransmissionTaskStats{
		TaskCount:      len(items),
		TotalSizeBytes: totalSizeBytes,
	}
	freeSpaceBytes, freeErr := s.loadTransmissionFreeSpace(ctx, cfg)
	if freeErr == nil {
		stats.FreeSpaceBytes = freeSpaceBytes
		stats.FreeSpaceAvailable = true
	}
	return stats, nil
}

func (s *service) DeletePlayerTransmissionTask(
	ctx context.Context,
	input TransmissionTaskDeleteInput,
) (TransmissionTaskDeleteResult, error) {
	cfg, err := s.loadTransmissionSettings(ctx)
	if err != nil {
		return TransmissionTaskDeleteResult{}, err
	}
	if input.ID <= 0 {
		return TransmissionTaskDeleteResult{}, fmt.Errorf("%w: transmission task id", ErrInvalidInput)
	}
	if err := s.removeTransmissionTasks(ctx, cfg, []int64{input.ID}); err != nil {
		return TransmissionTaskDeleteResult{}, err
	}
	return TransmissionTaskDeleteResult{
		Success: true,
		ID:      input.ID,
	}, nil
}

func (s *service) RunPlayerTransmissionCleanup(ctx context.Context) (TransmissionCleanupResult, error) {
	cfg, err := s.loadTransmissionSettings(ctx)
	if err != nil {
		return TransmissionCleanupResult{}, err
	}
	return s.runTransmissionCleanup(ctx, cfg, true, nil)
}

func (s *service) runTransmissionCleanup(
	ctx context.Context,
	cfg TransmissionSettings,
	force bool,
	preservedIDs map[int64]struct{},
) (TransmissionCleanupResult, error) {
	slowCleanupEnabled := cfg.AutoCleanupSlowTaskEnabled
	storageCleanupEnabled := cfg.AutoCleanupStorageEnabled
	if !force && !cfg.AutoCleanupEnabled {
		return TransmissionCleanupResult{Success: true}, nil
	}

	items, err := s.loadTransmissionTaskItems(ctx, cfg)
	if err != nil {
		return TransmissionCleanupResult{}, err
	}
	result := TransmissionCleanupResult{
		Success:     true,
		TotalBefore: len(items),
		RemovedIDs:  make([]int64, 0),
		Reasons:     make([]string, 0),
	}
	if len(items) == 0 {
		return result, nil
	}

	removeSet := make(map[int64]struct{})
	estimatedGain := int64(0)
	totalSizeHint := int64(0)
	for _, item := range items {
		totalSizeHint += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
	}
	mark := func(id int64, reason string, sizeHint int64) {
		if id <= 0 {
			return
		}
		if preservedIDs != nil {
			if _, ok := preservedIDs[id]; ok {
				return
			}
		}
		if _, ok := removeSet[id]; ok {
			return
		}
		removeSet[id] = struct{}{}
		result.Reasons = append(result.Reasons, reason)
		estimatedGain += maxTransmissionSizeHint(sizeHint, 0)
	}

	for _, item := range items {
		if item.Error > 0 || strings.TrimSpace(item.ErrorString) != "" {
			mark(item.ID, fmt.Sprintf("error-task: %s", strings.TrimSpace(item.Name)), item.SizeWhenDone)
		}
	}

	if slowCleanupEnabled && cfg.AutoCleanupSlowRateKbps > 0 && cfg.AutoCleanupSlowWindowMinutes >= 5 {
		nowUnix := time.Now().Unix()
		windowSeconds := int64(cfg.AutoCleanupSlowWindowMinutes) * 60
		rateThresholdBytes := int64(cfg.AutoCleanupSlowRateKbps) * 1024
		for _, item := range items {
			if item.LeftUntilDone <= 0 || item.IsFinished {
				continue
			}
			if item.Status != 3 && item.Status != 4 {
				continue
			}
			if item.AddedDate <= 0 || nowUnix-item.AddedDate < windowSeconds {
				continue
			}
			if item.RateDownload >= rateThresholdBytes {
				continue
			}
			mark(
				item.ID,
				fmt.Sprintf(
					"slow-task (>= %d min, < %d KB/s): %s",
					cfg.AutoCleanupSlowWindowMinutes,
					cfg.AutoCleanupSlowRateKbps,
					strings.TrimSpace(item.Name),
				),
				item.SizeWhenDone,
			)
		}
	}

	if storageCleanupEnabled && cfg.AutoCleanupMaxTotalSizeGB > 0 {
		thresholdBytes := int64(cfg.AutoCleanupMaxTotalSizeGB) * 1024 * 1024 * 1024
		if thresholdBytes > 0 {
			currentTotal := totalSizeHint - estimatedGain
			if currentTotal > thresholdBytes {
				needTrim := currentTotal - thresholdBytes
				ordered := orderedTransmissionTaskItems(items, false)
				collected := int64(0)
				for _, item := range ordered {
					if collected >= needTrim {
						break
					}
					if preservedIDs != nil {
						if _, ok := preservedIDs[item.ID]; ok {
							continue
						}
					}
					if _, ok := removeSet[item.ID]; ok {
						collected += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
						continue
					}
					mark(item.ID, fmt.Sprintf("max-total-size overflow (> %d GB): %s", cfg.AutoCleanupMaxTotalSizeGB, strings.TrimSpace(item.Name)), item.SizeWhenDone)
					collected += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
				}
			}
		}
	}

	if storageCleanupEnabled && cfg.AutoCleanupMaxTasks > 0 {
		remainingCount := len(items) - len(removeSet)
		if remainingCount > cfg.AutoCleanupMaxTasks {
			ordered := orderedTransmissionTaskItems(items, false)
			need := remainingCount - cfg.AutoCleanupMaxTasks
			for _, item := range ordered {
				if need <= 0 {
					break
				}
				if preservedIDs != nil {
					if _, ok := preservedIDs[item.ID]; ok {
						continue
					}
				}
				if _, ok := removeSet[item.ID]; ok {
					continue
				}
				mark(item.ID, fmt.Sprintf("max-tasks overflow (> %d): %s", cfg.AutoCleanupMaxTasks, strings.TrimSpace(item.Name)), item.SizeWhenDone)
				need--
			}
		}
	}

	if storageCleanupEnabled && cfg.AutoCleanupMinFreeSpaceGB > 0 {
		freeBytes, freeErr := s.loadTransmissionFreeSpace(ctx, cfg)
		if freeErr == nil {
			thresholdBytes := int64(cfg.AutoCleanupMinFreeSpaceGB) * 1024 * 1024 * 1024
			if freeBytes < thresholdBytes {
				needGain := thresholdBytes - freeBytes
				ordered := orderedTransmissionTaskItems(items, true)
				collected := int64(0)
				for _, item := range ordered {
					if collected >= needGain {
						break
					}
					if preservedIDs != nil {
						if _, ok := preservedIDs[item.ID]; ok {
							continue
						}
					}
					if _, ok := removeSet[item.ID]; ok {
						collected += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
						continue
					}
					mark(item.ID, fmt.Sprintf("low-free-space (< %d GB): %s", cfg.AutoCleanupMinFreeSpaceGB, strings.TrimSpace(item.Name)), item.SizeWhenDone)
					collected += maxTransmissionSizeHint(item.SizeWhenDone, item.LeftUntilDone)
				}
			}
		}
	}

	if len(removeSet) == 0 {
		return result, nil
	}

	ids := make([]int64, 0, len(removeSet))
	for id := range removeSet {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	if err := s.removeTransmissionTasks(ctx, cfg, ids); err != nil {
		return TransmissionCleanupResult{}, err
	}
	result.RemovedIDs = ids
	result.RemovedCount = len(ids)
	result.EstimatedFreeGain = estimatedGain
	return result, nil
}

func (s *service) loadTransmissionSettings(ctx context.Context) (TransmissionSettings, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return TransmissionSettings{}, err
	}
	cfg := settings.Player.Transmission
	cfg.URL = firstNonEmptyTrimmed(cfg.URL, s.defaults.Player.Transmission.URL)
	cfg.TimeoutSeconds = normalizeTransmissionTimeoutSeconds(cfg.TimeoutSeconds, s.defaults.Player.Transmission.TimeoutSeconds)
	if !validTransmissionTimeoutSeconds(cfg.TimeoutSeconds) {
		cfg.TimeoutSeconds = s.defaults.Player.Transmission.TimeoutSeconds
	}
	return cfg, nil
}

func mapTransmissionTask(item transmissionTorrentItem) TransmissionTask {
	return TransmissionTask{
		ID:             item.ID,
		HashString:     strings.TrimSpace(item.HashString),
		Name:           strings.TrimSpace(item.Name),
		Status:         item.Status,
		PercentDone:    item.PercentDone,
		RateDownload:   item.RateDownload,
		RateUpload:     item.RateUpload,
		LeftUntilDone:  item.LeftUntilDone,
		SizeWhenDone:   item.SizeWhenDone,
		AddedAtUnix:    item.AddedDate,
		ActivityAtUnix: item.ActivityDate,
		IsFinished:     item.IsFinished,
		DownloadDir:    strings.TrimSpace(item.DownloadDir),
		ErrorString:    strings.TrimSpace(item.ErrorString),
	}
}

func orderedTransmissionTaskItems(items []transmissionTorrentItem, finishedFirst bool) []transmissionTorrentItem {
	ordered := append([]transmissionTorrentItem(nil), items...)
	sort.Slice(ordered, func(i, j int) bool {
		if finishedFirst {
			iFinished := ordered[i].IsFinished || ordered[i].LeftUntilDone <= 0
			jFinished := ordered[j].IsFinished || ordered[j].LeftUntilDone <= 0
			if iFinished != jFinished {
				return iFinished
			}
		}
		left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
		right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
		if left == right {
			return ordered[i].ID < ordered[j].ID
		}
		return left < right
	})
	return ordered
}

func maxTransmissionSizeHint(sizeWhenDone int64, leftUntilDone int64) int64 {
	if sizeWhenDone > leftUntilDone {
		return sizeWhenDone
	}
	if leftUntilDone > 0 {
		return leftUntilDone
	}
	return 0
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func boolPtr(value bool) *bool {
	v := value
	return &v
}

package media

import (
	"context"
	"sort"
	"strings"
	"time"
)

func (s *service) playerTransmissionAutoCleanup(
	ctx context.Context,
	settings playerBootstrapSettings,
	preserveInfoHash string,
) error {
	if !settings.TransmissionCleanupEnabled {
		return nil
	}
	slowCleanupEnabled := settings.TransmissionCleanupSlowTaskEnabled
	storageCleanupEnabled := settings.TransmissionCleanupStorageEnabled

	torrents, err := s.playerTransmissionLoadAllTorrents(ctx, settings)
	if err != nil {
		return err
	}
	if len(torrents) == 0 {
		return nil
	}

	preserveHash := strings.TrimSpace(strings.ToLower(preserveInfoHash))
	toRemove := make(map[int64]struct{})
	estimatedFreeGain := int64(0)
	totalSizeHint := int64(0)
	for _, item := range torrents {
		totalSizeHint += playerTransmissionTorrentSizeHint(item)
	}
	markRemove := func(item playerTransmissionRPCTorrent) {
		if item.ID <= 0 {
			return
		}
		if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
			return
		}
		if _, ok := toRemove[item.ID]; ok {
			return
		}
		toRemove[item.ID] = struct{}{}
		estimatedFreeGain += playerTransmissionTorrentSizeHint(item)
	}

	for _, item := range torrents {
		if item.Error > 0 || strings.TrimSpace(item.ErrorString) != "" {
			markRemove(item)
		}
	}

	if slowCleanupEnabled && settings.TransmissionCleanupSlowRateKbps > 0 && settings.TransmissionCleanupSlowWindowMinutes >= 5 {
		nowUnix := time.Now().Unix()
		windowSeconds := int64(settings.TransmissionCleanupSlowWindowMinutes) * 60
		rateThreshold := int64(settings.TransmissionCleanupSlowRateKbps) * 1024
		for _, item := range torrents {
			if item.LeftUntilDone <= 0 || item.IsFinished {
				continue
			}
			if item.Status != 3 && item.Status != 4 {
				continue
			}
			if item.AddedDate <= 0 || nowUnix-item.AddedDate < windowSeconds {
				continue
			}
			if item.RateDownload >= rateThreshold {
				continue
			}
			markRemove(item)
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMaxTotalSizeGB > 0 {
		threshold := int64(settings.TransmissionCleanupMaxTotalSizeGB) * 1024 * 1024 * 1024
		if threshold > 0 {
			currentTotal := totalSizeHint - estimatedFreeGain
			if currentTotal > threshold {
				needTrim := currentTotal - threshold
				ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
				sort.Slice(ordered, func(i, j int) bool {
					left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
					right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
					if left == right {
						return ordered[i].ID < ordered[j].ID
					}
					return left < right
				})
				trimmed := int64(0)
				for _, item := range ordered {
					if trimmed >= needTrim {
						break
					}
					if _, ok := toRemove[item.ID]; ok {
						trimmed += playerTransmissionTorrentSizeHint(item)
						continue
					}
					markRemove(item)
					trimmed += playerTransmissionTorrentSizeHint(item)
				}
			}
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMaxTasks > 0 {
		remainingCount := len(torrents) - len(toRemove)
		if remainingCount > settings.TransmissionCleanupMaxTasks {
			ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
			sort.Slice(ordered, func(i, j int) bool {
				left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
				right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
				if left == right {
					return ordered[i].ID < ordered[j].ID
				}
				return left < right
			})
			need := remainingCount - settings.TransmissionCleanupMaxTasks
			for _, item := range ordered {
				if need <= 0 {
					break
				}
				if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
					continue
				}
				if _, ok := toRemove[item.ID]; ok {
					continue
				}
				markRemove(item)
				need--
			}
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMinFreeSpaceGB > 0 {
		freeBytes, freeErr := s.playerTransmissionLoadFreeSpace(ctx, settings)
		if freeErr == nil {
			threshold := int64(settings.TransmissionCleanupMinFreeSpaceGB) * 1024 * 1024 * 1024
			if freeBytes+estimatedFreeGain < threshold {
				needGain := threshold - (freeBytes + estimatedFreeGain)
				ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
				sort.Slice(ordered, func(i, j int) bool {
					iFinished := ordered[i].IsFinished || ordered[i].LeftUntilDone <= 0
					jFinished := ordered[j].IsFinished || ordered[j].LeftUntilDone <= 0
					if iFinished != jFinished {
						return iFinished
					}
					left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
					right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
					if left == right {
						return ordered[i].ID < ordered[j].ID
					}
					return left < right
				})
				collected := int64(0)
				for _, item := range ordered {
					if collected >= needGain {
						break
					}
					if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
						continue
					}
					if _, ok := toRemove[item.ID]; ok {
						collected += playerTransmissionTorrentSizeHint(item)
						continue
					}
					markRemove(item)
					collected += playerTransmissionTorrentSizeHint(item)
				}
			}
		}
	}

	if len(toRemove) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(toRemove))
	for id := range toRemove {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return s.playerTransmissionRemoveTorrents(ctx, settings, ids)
}

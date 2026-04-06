package adminsettings

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

type transmissionTorrentRequest struct {
	Method    string                         `json:"method"`
	Arguments transmissionTorrentRequestArgs `json:"arguments,omitempty"`
}

type transmissionTorrentRequestArgs struct {
	Fields          []string `json:"fields,omitempty"`
	IDs             []int64  `json:"ids,omitempty"`
	DeleteLocalData *bool    `json:"delete-local-data,omitempty"`
}

type transmissionTorrentResponse struct {
	Result    string                             `json:"result"`
	Arguments transmissionTorrentResponsePayload `json:"arguments"`
}

type transmissionTorrentResponsePayload struct {
	Torrents []transmissionTorrentItem `json:"torrents"`
}

type transmissionTorrentItem struct {
	ID            int64   `json:"id"`
	HashString    string  `json:"hashString"`
	Name          string  `json:"name"`
	Status        int     `json:"status"`
	Error         int     `json:"error"`
	PercentDone   float64 `json:"percentDone"`
	RateDownload  int64   `json:"rateDownload"`
	RateUpload    int64   `json:"rateUpload"`
	LeftUntilDone int64   `json:"leftUntilDone"`
	SizeWhenDone  int64   `json:"sizeWhenDone"`
	AddedDate     int64   `json:"addedDate"`
	ActivityDate  int64   `json:"activityDate"`
	IsFinished    bool    `json:"isFinished"`
	DownloadDir   string  `json:"downloadDir"`
	ErrorString   string  `json:"errorString"`
}

type transmissionSessionResponse struct {
	Result    string                             `json:"result"`
	Arguments transmissionSessionResponsePayload `json:"arguments"`
}

type transmissionSessionResponsePayload struct {
	DownloadDirFreeSpace int64 `json:"download-dir-free-space"`
}

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
				ordered := append([]transmissionTorrentItem(nil), items...)
				sort.Slice(ordered, func(i, j int) bool {
					left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
					right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
					if left == right {
						return ordered[i].ID < ordered[j].ID
					}
					return left < right
				})
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
			ordered := append([]transmissionTorrentItem(nil), items...)
			sort.Slice(ordered, func(i, j int) bool {
				left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
				right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
				if left == right {
					return ordered[i].ID < ordered[j].ID
				}
				return left < right
			})
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
				ordered := append([]transmissionTorrentItem(nil), items...)
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

func (s *service) loadTransmissionTaskItems(
	ctx context.Context,
	cfg TransmissionSettings,
) ([]transmissionTorrentItem, error) {
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "torrent-get",
		Arguments: transmissionTorrentRequestArgs{
			Fields: []string{
				"id",
				"hashString",
				"name",
				"status",
				"error",
				"percentDone",
				"rateDownload",
				"rateUpload",
				"leftUntilDone",
				"sizeWhenDone",
				"addedDate",
				"activityDate",
				"isFinished",
				"downloadDir",
				"errorString",
			},
		},
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}

	var response transmissionTorrentResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.Torrents, nil
}

func (s *service) loadTransmissionFreeSpace(ctx context.Context, cfg TransmissionSettings) (int64, error) {
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "session-get",
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return 0, err
	}
	var response transmissionSessionResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return 0, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return 0, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.DownloadDirFreeSpace, nil
}

func (s *service) removeTransmissionTasks(
	ctx context.Context,
	cfg TransmissionSettings,
	ids []int64,
) error {
	if len(ids) == 0 {
		return nil
	}
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "torrent-remove",
		Arguments: transmissionTorrentRequestArgs{
			IDs:             ids,
			DeleteLocalData: boolPtr(true),
		},
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return err
	}
	var response transmissionTorrentResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return fmt.Errorf("transmission torrent-remove result=%q", strings.TrimSpace(response.Result))
	}
	return nil
}

func (s *service) loadTransmissionSettings(ctx context.Context) (TransmissionSettings, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return TransmissionSettings{}, err
	}
	cfg := settings.Player.Transmission
	if strings.TrimSpace(cfg.URL) == "" {
		cfg.URL = strings.TrimSpace(s.defaults.Player.Transmission.URL)
	}
	if cfg.TimeoutSeconds < 2 || cfg.TimeoutSeconds > 60 {
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

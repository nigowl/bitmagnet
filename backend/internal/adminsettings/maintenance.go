package adminsettings

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/nigowl/bitmagnet/internal/media"
	"go.uber.org/zap"
)

var ErrTaskNotFound = errors.New("task not found")

const (
	MaintenanceTaskTypeFixLocalized  = "fix_localized_metadata"
	MaintenanceTaskTypeFixCoverCache = "fix_cover_cache"
)

const maintenanceTaskMaxLogs = 180

const (
	MaintenanceTaskStatusPending = "pending"
	MaintenanceTaskStatusRunning = "running"
	MaintenanceTaskStatusSuccess = "success"
	MaintenanceTaskStatusFailed  = "failed"
)

type MaintenanceTaskInput struct {
	Type  string `json:"type"`
	Limit int    `json:"limit"`
}

type MaintenanceStats struct {
	Type    string `json:"type"`
	Pending int    `json:"pending"`
}

type MaintenanceTask struct {
	ID         string     `json:"id"`
	Type       string     `json:"type"`
	Limit      int        `json:"limit"`
	Status     string     `json:"status"`
	Requested  int        `json:"requested"`
	Processed  int        `json:"processed"`
	Updated    int        `json:"updated"`
	Remaining  int        `json:"remaining"`
	Failed     int        `json:"failed"`
	Message    string     `json:"message,omitempty"`
	Error      string     `json:"error,omitempty"`
	Logs       []string   `json:"logs,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
	DurationMs int64      `json:"durationMs,omitempty"`
}

func (s *service) StartMaintenanceTask(_ context.Context, input MaintenanceTaskInput) (MaintenanceTask, error) {
	if s.mediaService == nil {
		return MaintenanceTask{}, errors.New("media service not available")
	}

	taskType := strings.TrimSpace(strings.ToLower(input.Type))
	if taskType != MaintenanceTaskTypeFixLocalized && taskType != MaintenanceTaskTypeFixCoverCache {
		return MaintenanceTask{}, fmt.Errorf("%w: type", ErrInvalidInput)
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 2000 {
		limit = 2000
	}

	now := time.Now()
	id := fmt.Sprintf("task-%d-%d", now.UnixMilli(), atomic.AddUint64(&s.maintenanceSeq, 1))
	task := &MaintenanceTask{
		ID:        id,
		Type:      taskType,
		Limit:     limit,
		Status:    MaintenanceTaskStatusPending,
		Message:   "queued",
		CreatedAt: now,
	}
	appendMaintenanceLog(task, "queued")

	s.maintenanceMu.Lock()
	s.maintenanceTasks[id] = task
	s.pruneMaintenanceTasksLocked(80)
	s.maintenanceMu.Unlock()

	go s.runMaintenanceTask(id)

	return cloneMaintenanceTask(task), nil
}

func (s *service) GetMaintenanceStats(ctx context.Context, taskType string) (MaintenanceStats, error) {
	if s.mediaService == nil {
		return MaintenanceStats{}, errors.New("media service not available")
	}

	normalized := strings.TrimSpace(strings.ToLower(taskType))
	var (
		pending int
		err     error
	)

	switch normalized {
	case MaintenanceTaskTypeFixLocalized:
		pending, err = s.mediaService.CountPendingLocalizedMetadata(ctx)
	case MaintenanceTaskTypeFixCoverCache:
		pending, err = s.mediaService.CountPendingCoverCache(ctx)
	default:
		return MaintenanceStats{}, fmt.Errorf("%w: type", ErrInvalidInput)
	}
	if err != nil {
		return MaintenanceStats{}, err
	}

	return MaintenanceStats{
		Type:    normalized,
		Pending: pending,
	}, nil
}

func (s *service) GetMaintenanceTask(_ context.Context, taskID string) (MaintenanceTask, error) {
	id := strings.TrimSpace(taskID)
	if id == "" {
		return MaintenanceTask{}, fmt.Errorf("%w: taskId", ErrInvalidInput)
	}

	s.maintenanceMu.RLock()
	task, ok := s.maintenanceTasks[id]
	s.maintenanceMu.RUnlock()
	if !ok {
		return MaintenanceTask{}, ErrTaskNotFound
	}
	return cloneMaintenanceTask(task), nil
}

func (s *service) runMaintenanceTask(taskID string) {
	started := time.Now()
	s.updateMaintenanceTask(taskID, func(task *MaintenanceTask) {
		task.Status = MaintenanceTaskStatusRunning
		task.StartedAt = &started
		task.Message = "running"
		appendMaintenanceLog(task, "task started")
	})

	task, ok := s.readMaintenanceTask(taskID)
	if !ok {
		return
	}

	switch task.Type {
	case MaintenanceTaskTypeFixLocalized:
		s.runLocalizedTask(task)
	case MaintenanceTaskTypeFixCoverCache:
		s.runCoverCacheTask(task)
	default:
		s.finishMaintenanceTask(task.ID, MaintenanceTaskStatusFailed, errors.New("unsupported task type"), "")
	}
}

func (s *service) runLocalizedTask(task MaintenanceTask) {
	result, err := s.mediaService.BackfillLocalizedMetadata(context.Background(), media.BackfillLocalizedInput{
		Limit: task.Limit,
		Progress: func(progress media.BackfillProgressInfo) {
			s.updateMaintenanceTask(task.ID, func(current *MaintenanceTask) {
				current.Requested = progress.Requested
				current.Processed = progress.Processed
				current.Updated = progress.Updated
				current.Remaining = progress.Remaining
				if strings.TrimSpace(progress.CurrentID) != "" {
					current.Message = fmt.Sprintf("processing %s", progress.CurrentID)
					appendMaintenanceLog(current, fmt.Sprintf(
						"localized: %s (%d/%d)",
						progress.CurrentID,
						progress.Processed,
						maxInt(progress.Requested, 1),
					))
				} else if strings.TrimSpace(progress.Message) != "" {
					current.Message = progress.Message
					appendMaintenanceLog(current, progress.Message)
				}
			})
		},
	})
	if err != nil {
		s.finishMaintenanceTask(task.ID, MaintenanceTaskStatusFailed, err, "")
		return
	}

	s.updateMaintenanceTask(task.ID, func(current *MaintenanceTask) {
		current.Requested = result.Requested
		current.Processed = result.Processed
		current.Updated = result.Updated
		current.Remaining = result.Remaining
		current.DurationMs = result.DurationMs
		appendMaintenanceLog(current, fmt.Sprintf(
			"localized completed: processed=%d updated=%d remaining=%d duration=%dms",
			result.Processed,
			result.Updated,
			result.Remaining,
			result.DurationMs,
		))
	})
	s.finishMaintenanceTask(task.ID, MaintenanceTaskStatusSuccess, nil, "localized metadata repair completed")
}

func (s *service) runCoverCacheTask(task MaintenanceTask) {
	result, err := s.mediaService.BackfillCoverCache(context.Background(), media.BackfillCoverCacheInput{
		Limit: task.Limit,
		Progress: func(progress media.BackfillProgressInfo) {
			s.updateMaintenanceTask(task.ID, func(current *MaintenanceTask) {
				current.Requested = progress.Requested
				current.Processed = progress.Processed
				current.Updated = progress.Updated
				current.Remaining = progress.Remaining
				if strings.TrimSpace(progress.CurrentID) != "" {
					current.Message = fmt.Sprintf("processing %s", progress.CurrentID)
					appendMaintenanceLog(current, fmt.Sprintf(
						"cover cache: %s (%d/%d)",
						progress.CurrentID,
						progress.Processed,
						maxInt(progress.Requested, 1),
					))
				} else if strings.TrimSpace(progress.Message) != "" {
					current.Message = progress.Message
					appendMaintenanceLog(current, progress.Message)
				}
			})
		},
	})
	if err != nil {
		s.finishMaintenanceTask(task.ID, MaintenanceTaskStatusFailed, err, "")
		return
	}

	s.updateMaintenanceTask(task.ID, func(current *MaintenanceTask) {
		current.Requested = result.Requested
		current.Processed = result.Processed
		current.Updated = result.Updated
		current.Remaining = result.Remaining
		current.Failed = result.Failed
		current.DurationMs = result.DurationMs
		appendMaintenanceLog(current, fmt.Sprintf(
			"cover cache completed: processed=%d updated=%d failed=%d remaining=%d duration=%dms",
			result.Processed,
			result.Updated,
			result.Failed,
			result.Remaining,
			result.DurationMs,
		))
	})
	s.finishMaintenanceTask(task.ID, MaintenanceTaskStatusSuccess, nil, "cover cache repair completed")
}

func (s *service) finishMaintenanceTask(taskID string, status string, runErr error, message string) {
	finished := time.Now()
	s.updateMaintenanceTask(taskID, func(task *MaintenanceTask) {
		task.Status = status
		task.FinishedAt = &finished
		if task.StartedAt != nil {
			task.DurationMs = finished.Sub(*task.StartedAt).Milliseconds()
		}
		if runErr != nil {
			task.Error = runErr.Error()
			task.Message = "failed"
			appendMaintenanceLog(task, fmt.Sprintf("failed: %s", runErr.Error()))
		} else if strings.TrimSpace(message) != "" {
			task.Message = message
			appendMaintenanceLog(task, message)
		}
	})
	if runErr != nil {
		s.logger.Error("maintenance task failed", zap.String("taskId", taskID), zap.Error(runErr))
		return
	}
	s.logger.Info("maintenance task completed", zap.String("taskId", taskID))
}

func (s *service) updateMaintenanceTask(taskID string, update func(task *MaintenanceTask)) {
	s.maintenanceMu.Lock()
	defer s.maintenanceMu.Unlock()

	task, ok := s.maintenanceTasks[taskID]
	if !ok {
		return
	}
	update(task)
}

func (s *service) readMaintenanceTask(taskID string) (MaintenanceTask, bool) {
	s.maintenanceMu.RLock()
	defer s.maintenanceMu.RUnlock()

	task, ok := s.maintenanceTasks[taskID]
	if !ok {
		return MaintenanceTask{}, false
	}
	return cloneMaintenanceTask(task), true
}

func cloneMaintenanceTask(task *MaintenanceTask) MaintenanceTask {
	if task == nil {
		return MaintenanceTask{}
	}
	copy := *task
	if len(task.Logs) > 0 {
		copy.Logs = append([]string(nil), task.Logs...)
	}
	return copy
}

func (s *service) pruneMaintenanceTasksLocked(max int) {
	if max <= 0 || len(s.maintenanceTasks) <= max {
		return
	}

	for len(s.maintenanceTasks) > max {
		var oldestID string
		var oldestCreatedAt time.Time
		for id, task := range s.maintenanceTasks {
			if oldestID == "" || task.CreatedAt.Before(oldestCreatedAt) {
				oldestID = id
				oldestCreatedAt = task.CreatedAt
			}
		}
		if oldestID == "" {
			return
		}
		delete(s.maintenanceTasks, oldestID)
	}
}

func appendMaintenanceLog(task *MaintenanceTask, message string) {
	if task == nil {
		return
	}
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return
	}
	entry := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), trimmed)
	task.Logs = append(task.Logs, entry)
	if len(task.Logs) > maintenanceTaskMaxLogs {
		task.Logs = task.Logs[len(task.Logs)-maintenanceTaskMaxLogs:]
	}
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}

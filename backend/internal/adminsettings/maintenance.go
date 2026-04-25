package adminsettings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
	"go.uber.org/zap"
	"gorm.io/gorm"
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
	Type      string `json:"type"`
	Limit     int    `json:"limit"`
	BatchSize int    `json:"batchSize"`
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

func (s *service) StartMaintenanceTask(ctx context.Context, input MaintenanceTaskInput) (MaintenanceTask, error) {
	taskType, err := normalizeMaintenanceTaskType(input.Type)
	if err != nil {
		return MaintenanceTask{}, err
	}

	totalLimit := normalizeMaintenanceLimit(input.Limit)
	batchSize := normalizeMaintenanceBatchSize(input.BatchSize, totalLimit)
	batchLimits := splitMaintenanceBatchLimits(totalLimit, batchSize)
	if len(batchLimits) == 0 {
		return MaintenanceTask{}, fmt.Errorf("%w: limit", ErrInvalidInput)
	}

	db, err := s.db.Get()
	if err != nil {
		return MaintenanceTask{}, err
	}

	jobs := make([]model.QueueJob, 0, len(batchLimits))
	for index, itemLimit := range batchLimits {
		job, jobErr := newMaintenanceQueueJob(taskType, uint(itemLimit))
		if jobErr != nil {
			return MaintenanceTask{}, jobErr
		}
		if len(batchLimits) > 1 {
			job.Fingerprint = fmt.Sprintf("%s:batch-%d-of-%d", job.Fingerprint, index+1, len(batchLimits))
		}
		jobs = append(jobs, job)
	}

	if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for index := range jobs {
			if createErr := tx.Create(&jobs[index]).Error; createErr != nil {
				return createErr
			}
		}
		return nil
	}); err != nil {
		return MaintenanceTask{}, err
	}

	task := maintenanceTaskFromQueueJob(jobs[0], taskType, batchLimits[0])
	task.Message = "queued"
	appendMaintenanceLog(&task, fmt.Sprintf("queued %d job(s), total=%d, batchSize=%d", len(batchLimits), totalLimit, batchSize))
	appendMaintenanceLog(&task, fmt.Sprintf("first job queue=%s limit=%d", jobs[0].Queue, batchLimits[0]))
	return task, nil
}

func (s *service) GetMaintenanceStats(ctx context.Context, taskType string) (MaintenanceStats, error) {
	normalizedType, err := normalizeMaintenanceTaskType(taskType)
	if err != nil {
		return MaintenanceStats{}, err
	}

	if s.mediaService != nil {
		switch normalizedType {
		case MaintenanceTaskTypeFixLocalized:
			pending, countErr := s.mediaService.CountPendingLocalizedMetadata(ctx)
			if countErr == nil {
				return MaintenanceStats{
					Type:    normalizedType,
					Pending: pending,
				}, nil
			}
			if s.logger != nil {
				s.logger.Warn("maintenance stats fallback to queue pending count",
					zap.String("type", normalizedType),
					zap.Error(countErr),
				)
			}
		case MaintenanceTaskTypeFixCoverCache:
			pending, countErr := s.mediaService.CountPendingCoverCache(ctx)
			if countErr == nil {
				return MaintenanceStats{
					Type:    normalizedType,
					Pending: pending,
				}, nil
			}
			if s.logger != nil {
				s.logger.Warn("maintenance stats fallback to queue pending count",
					zap.String("type", normalizedType),
					zap.Error(countErr),
				)
			}
		}
	}

	db, err := s.db.Get()
	if err != nil {
		return MaintenanceStats{}, err
	}

	queueName := maintenanceQueueName(normalizedType)
	var pending int64
	if err := db.WithContext(ctx).
		Model(&model.QueueJob{}).
		Where("queue = ?", queueName).
		Where("status IN ?", []string{
			string(model.QueueJobStatusPending),
			string(model.QueueJobStatusRetry),
		}).
		Where("payload::jsonb ? 'Limit'").
		Count(&pending).Error; err != nil {
		return MaintenanceStats{}, err
	}

	return MaintenanceStats{
		Type:    normalizedType,
		Pending: int(pending),
	}, nil
}

func (s *service) GetMaintenanceTask(ctx context.Context, taskID string) (MaintenanceTask, error) {
	id := strings.TrimSpace(taskID)
	if id == "" {
		return MaintenanceTask{}, fmt.Errorf("%w: taskId", ErrInvalidInput)
	}

	db, err := s.db.Get()
	if err != nil {
		return MaintenanceTask{}, err
	}

	var job model.QueueJob
	if err := db.WithContext(ctx).Where("id = ?", id).Take(&job).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MaintenanceTask{}, ErrTaskNotFound
		}
		return MaintenanceTask{}, err
	}

	taskType, ok := maintenanceTaskTypeFromQueueName(job.Queue)
	if !ok {
		return MaintenanceTask{}, ErrTaskNotFound
	}

	limit, ok := parseMaintenanceLimit(job.Payload)
	if !ok {
		return MaintenanceTask{}, ErrTaskNotFound
	}

	return maintenanceTaskFromQueueJob(job, taskType, limit), nil
}

func normalizeMaintenanceTaskType(raw string) (string, error) {
	taskType := strings.TrimSpace(strings.ToLower(raw))
	switch taskType {
	case MaintenanceTaskTypeFixLocalized, media.QueueTaskTypeRefreshMetadata:
		return MaintenanceTaskTypeFixLocalized, nil
	case MaintenanceTaskTypeFixCoverCache, media.QueueTaskTypeBackfillCover, "image_cache", "cover_cache", "image_cache_backfill":
		return MaintenanceTaskTypeFixCoverCache, nil
	default:
		return "", fmt.Errorf("%w: type", ErrInvalidInput)
	}
}

func normalizeMaintenanceLimit(limit int) int {
	if limit <= 0 {
		return 10
	}
	if limit > 2000 {
		return 2000
	}
	return limit
}

func normalizeMaintenanceBatchSize(batchSize int, totalLimit int) int {
	if totalLimit <= 0 {
		return 1
	}
	if batchSize <= 0 {
		return totalLimit
	}
	if batchSize > totalLimit {
		return totalLimit
	}
	return batchSize
}

func splitMaintenanceBatchLimits(totalLimit int, batchSize int) []int {
	if totalLimit <= 0 {
		return nil
	}
	if batchSize <= 0 {
		batchSize = totalLimit
	}
	remaining := totalLimit
	batches := make([]int, 0, (totalLimit+batchSize-1)/batchSize)
	for remaining > 0 {
		next := batchSize
		if remaining < next {
			next = remaining
		}
		batches = append(batches, next)
		remaining -= next
	}
	return batches
}

func maintenanceQueueName(taskType string) string {
	switch taskType {
	case MaintenanceTaskTypeFixLocalized:
		return queue.QueueNameRefreshMediaMeta
	default:
		return queue.QueueNameBackfillCoverCache
	}
}

func maintenanceTaskTypeFromQueueName(queueName string) (string, bool) {
	switch strings.TrimSpace(queueName) {
	case queue.QueueNameRefreshMediaMeta:
		return MaintenanceTaskTypeFixLocalized, true
	case queue.QueueNameBackfillCoverCache:
		return MaintenanceTaskTypeFixCoverCache, true
	default:
		return "", false
	}
}

func newMaintenanceQueueJob(taskType string, limit uint) (model.QueueJob, error) {
	switch taskType {
	case MaintenanceTaskTypeFixLocalized:
		return media.NewRefreshMetadataQueueJob(limit)
	case MaintenanceTaskTypeFixCoverCache:
		return media.NewBackfillCoverQueueJob(limit)
	default:
		return model.QueueJob{}, fmt.Errorf("%w: type", ErrInvalidInput)
	}
}

func parseMaintenanceLimit(payload string) (int, bool) {
	trimmed := strings.TrimSpace(payload)
	if trimmed == "" {
		return 0, false
	}

	msg := media.QueueTaskMessage{}
	if err := json.Unmarshal([]byte(trimmed), &msg); err != nil {
		return 0, false
	}
	if msg.Limit <= 0 {
		return 0, false
	}
	return int(msg.Limit), true
}

func queueStatusToMaintenanceStatus(status model.QueueJobStatus) string {
	switch status {
	case model.QueueJobStatusProcessed:
		return MaintenanceTaskStatusSuccess
	case model.QueueJobStatusFailed:
		return MaintenanceTaskStatusFailed
	case model.QueueJobStatusPending, model.QueueJobStatusRetry:
		return MaintenanceTaskStatusPending
	default:
		return MaintenanceTaskStatusPending
	}
}

func maintenanceTaskFromQueueJob(job model.QueueJob, taskType string, limit int) MaintenanceTask {
	if limit <= 0 {
		limit = 10
	}

	status := queueStatusToMaintenanceStatus(job.Status)
	task := MaintenanceTask{
		ID:        job.ID,
		Type:      taskType,
		Limit:     limit,
		Status:    status,
		Requested: limit,
		CreatedAt: job.CreatedAt,
	}

	switch status {
	case MaintenanceTaskStatusSuccess:
		task.Processed = limit
		task.Updated = limit
		task.Remaining = 0
		task.Message = "completed by queue worker"
	case MaintenanceTaskStatusFailed:
		task.Failed = 1
		task.Remaining = limit
		task.Message = "queue worker failed"
	default:
		task.Remaining = limit
		task.Message = "queued"
	}

	if job.RanAt.Valid {
		finished := job.RanAt.Time
		task.FinishedAt = &finished

		duration := finished.Sub(job.CreatedAt).Milliseconds()
		if duration > 0 {
			task.DurationMs = duration
		}
	}

	if job.Error.Valid && strings.TrimSpace(job.Error.String) != "" {
		task.Error = strings.TrimSpace(job.Error.String)
	}

	appendMaintenanceLog(&task, fmt.Sprintf("queue=%s status=%s retries=%d/%d", job.Queue, job.Status, job.Retries, job.MaxRetries))
	if task.Error != "" {
		appendMaintenanceLog(&task, "error="+task.Error)
	}
	return task
}

func appendMaintenanceLog(task *MaintenanceTask, message string) {
	if task == nil {
		return
	}
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return
	}
	task.Logs = append(task.Logs, trimmed)
	if len(task.Logs) > maintenanceTaskMaxLogs {
		task.Logs = task.Logs[len(task.Logs)-maintenanceTaskMaxLogs:]
	}
}

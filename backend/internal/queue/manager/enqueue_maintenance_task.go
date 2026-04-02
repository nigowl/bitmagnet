package manager

import (
	"context"
	"fmt"
	"strings"

	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

func (m manager) EnqueueMaintenanceTask(ctx context.Context, req EnqueueMaintenanceTaskRequest) error {
	taskType := strings.TrimSpace(strings.ToLower(req.TaskType))
	if taskType == "" {
		return fmt.Errorf("task type is required")
	}

	limit := req.Limit
	if limit == 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	var (
		job model.QueueJob
		err error
	)

	switch taskType {
	case media.QueueTaskTypeRefreshMetadata:
		job, err = media.NewRefreshMetadataQueueJob(limit)
	case media.QueueTaskTypeBackfillCover, "image_cache", "cover_cache", "image_cache_backfill":
		job, err = media.NewBackfillCoverQueueJob(limit)
	default:
		return fmt.Errorf("unsupported maintenance task type: %s", taskType)
	}
	if err != nil {
		return err
	}

	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if req.Purge {
			if _, err := tx.WithContext(ctx).Raw("TRUNCATE TABLE " + model.TableNameQueueJob + ";").Rows(); err != nil {
				return fmt.Errorf("error purging queue: %w", err)
			}
		}
		return tx.WithContext(ctx).Create(&job).Error
	})
}

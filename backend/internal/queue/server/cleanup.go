package server

import (
	"context"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
)

func (s *server) runGarbageCollection(ctx context.Context) {
	for {
		s.refreshCleanupSettings(ctx)

		now := time.Now()
		nextRun := nextCleanupRun(now, s.cleanupHour)
		wait := time.Until(nextRun)
		if wait < 0 {
			wait = time.Second
		}

		s.logger.Infow(
			"queue cleanup scheduled",
			"next_run", nextRun,
			"cleanup_hour", s.cleanupHour,
			"max_records", s.cleanupCompletedMaxRecords,
			"max_age_days", s.cleanupCompletedMaxAgeDays,
		)

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return
		case <-timer.C:
			s.refreshCleanupSettings(ctx)

			byAge, byCount, err := s.cleanupCompletedQueueJobs(ctx, time.Now())
			if err != nil {
				s.logger.Errorw("error deleting old queue jobs", "error", err)
				continue
			}
			if byAge > 0 || byCount > 0 {
				s.logger.Infow(
					"queue cleanup completed",
					"deleted_by_age", byAge,
					"deleted_by_count", byCount,
					"max_records", s.cleanupCompletedMaxRecords,
					"max_age_days", s.cleanupCompletedMaxAgeDays,
				)
			} else {
				s.logger.Debugw("queue cleanup completed with no deletions")
			}
			continue
		}
	}
}

func nextCleanupRun(now time.Time, hour int) time.Time {
	if hour < 0 || hour > 23 {
		hour = 2
	}

	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func (s *server) refreshCleanupSettings(ctx context.Context) {
	perf := queue.LoadPerformanceConfig(
		ctx,
		s.query.QueueJob.WithContext(ctx).UnderlyingDB(),
		queue.NewDefaultPerformanceConfig(),
	)
	s.cleanupCompletedMaxRecords = perf.CleanupCompletedMaxRecords
	s.cleanupCompletedMaxAgeDays = perf.CleanupCompletedMaxAgeDays
}

func (s *server) cleanupCompletedQueueJobs(ctx context.Context, now time.Time) (deletedByAge int64, deletedByCount int64, err error) {
	q := s.query.QueueJob.WithContext(ctx)
	statuses := []string{
		string(model.QueueJobStatusProcessed),
		string(model.QueueJobStatusFailed),
	}

	if s.cleanupCompletedMaxAgeDays > 0 {
		cutoff := now.AddDate(0, 0, -s.cleanupCompletedMaxAgeDays)
		tx := q.Where(
			s.query.QueueJob.Status.In(statuses...),
		).UnderlyingDB().
			Where("COALESCE(ran_at, created_at) < ?", cutoff).
			Delete(&model.QueueJob{})
		if tx.Error != nil {
			return 0, 0, tx.Error
		}
		deletedByAge = tx.RowsAffected
	}

	if s.cleanupCompletedMaxRecords <= 0 {
		return deletedByAge, 0, nil
	}

	var completedCount int64
	if countErr := q.Where(
		s.query.QueueJob.Status.In(statuses...),
	).UnderlyingDB().Model(&model.QueueJob{}).Count(&completedCount).Error; countErr != nil {
		return deletedByAge, 0, countErr
	}

	overflow := completedCount - int64(s.cleanupCompletedMaxRecords)
	if overflow <= 0 {
		return deletedByAge, 0, nil
	}

	deleteSQL := `
WITH to_delete AS (
	SELECT id
	FROM ` + model.TableNameQueueJob + `
	WHERE status IN (?, ?)
	ORDER BY COALESCE(ran_at, created_at) ASC, created_at ASC
	LIMIT ?
)
DELETE FROM ` + model.TableNameQueueJob + ` q
USING to_delete d
WHERE q.id = d.id`
	tx := q.UnderlyingDB().Exec(deleteSQL, statuses[0], statuses[1], overflow)
	if tx.Error != nil {
		return deletedByAge, 0, tx.Error
	}

	return deletedByAge, tx.RowsAffected, nil
}

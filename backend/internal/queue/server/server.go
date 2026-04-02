// the listener connection code has been disabled:
// it would rarely be used anyway since a delay is now added to crawler jobs;
// if re-enabled in the future, some work is needed to gracefully handle disconnection

package server

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
	"github.com/nigowl/bitmagnet/internal/queue/handler"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
	"gorm.io/gen"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type server struct {
	stopped chan struct{}
	query   *dao.Query
	// pool       *pgxpool.Pool
	handlers                   []handler.Handler
	cleanupHour                int
	cleanupCompletedMaxRecords int
	cleanupCompletedMaxAgeDays int
	logger                     *zap.SugaredLogger
}

func (s *server) Start(ctx context.Context) (err error) {
	ctx, cancel := context.WithCancel(ctx)

	defer func() {
		if err != nil {
			cancel()
		}
	}()
	// pListenerConn, listenerConnErr := s.newListenerConn(ctx)
	// if listenerConnErr != nil {
	// 	err = listenerConnErr
	// 	return
	// }
	// listenerConn := pListenerConn.Conn()
	handlers := make([]serverHandler, len(s.handlers))
	listenerChans := make(map[string]chan pgconn.Notification)

	for i, h := range s.handlers {
		listenerChan := make(chan pgconn.Notification)
		sh := serverHandler{
			Handler: h,
			sem:     semaphore.NewWeighted(int64(h.Concurrency)),
			query:   s.query,
			// listenerConn: listenerConn,
			listenerChan: listenerChan,
			logger:       s.logger.With("queue", h.Queue),
		}
		handlers[i] = sh
		listenerChans[h.Queue] = listenerChan
		// if _, listenErr := listenerConn.Exec(ctx, fmt.Sprintf(`LISTEN %q`, h.Queue)); listenErr != nil {
		//	err = listenErr
		//	return
		//}
		go sh.start(ctx)
	}

	go func() {
		for {
			select {
			case <-s.stopped:
				cancel()
			case <-ctx.Done():
				// pListenerConn.Release()
				return
			}
		}
	}()
	// go func() {
	// 	for {
	// 		select {
	// 		case <-ctx.Done():
	// 			return
	// 		default:
	// 			notification, waitErr := listenerConn.WaitForNotification(ctx)
	// 			if waitErr != nil {
	// 				if !errors.Is(waitErr, context.Canceled) {
	// 					s.logger.Errorf("Error waiting for notification: %s", waitErr)
	// 				}
	// 				continue
	// 			}
	// 			ch, ok := listenerChans[notification.Channel]
	// 			if !ok {
	// 				s.logger.Errorf("Received notification for unknown channel: %s", notification.Channel)
	// 				continue
	// 			}
	// 			select {
	// 			case <-ctx.Done():
	// 				return
	// 			case ch <- *notification:
	// 				continue
	// 			}
	// 		}
	// 	}
	// }()
	go s.runGarbageCollection(ctx)

	return
}

// func (s *server) newListenerConn(ctx context.Context) (*pgxpool.Conn, error) {
//	conn, err := s.pool.Acquire(ctx)
//	if err != nil {
//		return nil, err
//	}
//	_, err = conn.Exec(ctx, "SET idle_in_transaction_session_timeout = 0")
//	if err != nil {
//		return nil, err
//	}
//	return conn, nil
//}

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

type serverHandler struct {
	handler.Handler
	sem   *semaphore.Weighted
	query *dao.Query
	// listenerConn *pgx.Conn
	listenerChan chan pgconn.Notification
	logger       *zap.SugaredLogger
}

func (h *serverHandler) start(ctx context.Context) {
	checkTicker := time.NewTicker(1)

	for {
		select {
		case <-ctx.Done():
			return
		case notification := <-h.listenerChan:
			if semErr := h.sem.Acquire(ctx, 1); semErr != nil {
				return
			}

			go func() {
				defer h.sem.Release(1)
				_, _, _ = h.handleJob(ctx, h.query.QueueJob.ID.Eq(notification.Payload))
			}()
		case <-checkTicker.C:
			if semErr := h.sem.Acquire(ctx, 1); semErr != nil {
				return
			}

			checkTicker.Reset(h.CheckInterval)

			go func() {
				defer h.sem.Release(1)
				jobID, _, err := h.handleJob(ctx)
				// if a job was found, we should check straight away for another job,
				// otherwise we wait for the check interval
				if err == nil && jobID != "" {
					checkTicker.Reset(1)
				}
			}()
		}
	}
}

func (h *serverHandler) handleJob(
	ctx context.Context,
	conds ...gen.Condition,
) (jobID string, processed bool, err error) {
	err = h.query.Transaction(func(tx *dao.Query) error {
		job, findErr := tx.QueueJob.WithContext(ctx).Where(
			append(
				conds,
				h.query.QueueJob.Queue.Eq(h.Queue),
				h.query.QueueJob.Status.In(
					string(model.QueueJobStatusPending),
					string(model.QueueJobStatusRetry),
				),
				h.query.QueueJob.RunAfter.Lte(time.Now()),
			)...,
		).Order(
			h.query.QueueJob.Status.Eq(string(model.QueueJobStatusRetry)),
			h.query.QueueJob.Priority,
			h.query.QueueJob.RunAfter,
			h.query.QueueJob.CreatedAt,
		).Clauses(clause.Locking{
			Strength: "UPDATE",
			Options:  "SKIP LOCKED",
		}).First()
		if findErr != nil {
			if errors.Is(findErr, gorm.ErrRecordNotFound) {
				return nil
			}

			return findErr
		}

		jobID = job.ID

		var jobErr error
		if job.Deadline.Valid && job.Deadline.Time.Before(time.Now()) {
			jobErr = ErrJobExceededDeadline

			h.logger.Debugw("job deadline is in the past, skipping", "job_id", job.ID)
		} else {
			// check if the job is being retried and increment retry count accordingly
			if job.Status != model.QueueJobStatusPending {
				job.Retries++
			}
			// execute the queue handler of this job
			jobErr = handler.Exec(ctx, h.Handler, *job)
		}

		job.RanAt = sql.NullTime{Time: time.Now(), Valid: true}

		if jobErr != nil {
			h.logger.Errorw(
				"job failed",
				"job_id", job.ID,
				"status", job.Status,
				"retries", job.Retries,
				"max_retries", job.MaxRetries,
				"payload", job.Payload,
				"error", jobErr,
			)

			if job.Retries < job.MaxRetries {
				job.Status = model.QueueJobStatusRetry
				job.RunAfter = queue.CalculateBackoff(job.Retries)
			} else {
				job.Status = model.QueueJobStatusFailed
			}

			job.Error = model.NewNullString(jobErr.Error())
		} else {
			job.Status = model.QueueJobStatusProcessed
			processed = true
		}

		_, updateErr := tx.QueueJob.WithContext(ctx).Updates(job)

		return updateErr
	})
	if err != nil {
		h.logger.Error("error handling job", "error", err)
	} else if processed {
		h.logger.Debugw("job processed", "job_id", jobID, "queue", h.Queue)
	}

	return
}

var ErrJobExceededDeadline = errors.New("the job did not complete before its deadline")

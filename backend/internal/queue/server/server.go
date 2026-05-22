package server

import (
	"context"
	"errors"
	"time"

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
	stopped                    chan struct{}
	query                      *dao.Query
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
	handlers := make([]serverHandler, len(s.handlers))

	for i, h := range s.handlers {
		sh := serverHandler{
			Handler: h,
			sem:     semaphore.NewWeighted(int64(h.Concurrency)),
			query:   s.query,
			logger:  s.logger.With("queue", h.Queue),
		}
		handlers[i] = sh
		go sh.start(ctx)
	}

	go func() {
		for {
			select {
			case <-s.stopped:
				cancel()
			case <-ctx.Done():
				return
			}
		}
	}()
	go s.runGarbageCollection(ctx)

	return
}

type serverHandler struct {
	handler.Handler
	sem    *semaphore.Weighted
	query  *dao.Query
	logger *zap.SugaredLogger
}

func (h *serverHandler) start(ctx context.Context) {
	checkTicker := time.NewTicker(1)

	for {
		select {
		case <-ctx.Done():
			return
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
			if isContextCancellation(jobErr) {
				h.logger.Debugw(
					"job execution canceled while handling queue job",
					"job_id", job.ID,
					"queue", h.Queue,
					"error", jobErr,
				)
				return jobErr
			}
		}

		job.RanAt = model.NewNullTime(time.Now())

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
		if isContextCancellation(err) {
			h.logger.Debugw("job handling canceled", "queue", h.Queue, "error", err)
		} else {
			h.logger.Errorw("error handling job", "queue", h.Queue, "error", err)
		}
	} else if processed {
		h.logger.Debugw("job processed", "job_id", jobID, "queue", h.Queue)
	}

	return
}

var ErrJobExceededDeadline = errors.New("the job did not complete before its deadline")

func isContextCancellation(err error) bool {
	return errors.Is(err, context.Canceled)
}

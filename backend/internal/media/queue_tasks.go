package media

import (
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/queue"
)

const (
	QueueTaskTypeRefreshMetadata = "refresh_media_metadata"
	QueueTaskTypeBackfillCover   = "backfill_cover_cache"

	refreshMetadataPriority = 2
	backfillCoverPriority   = 3
)

type QueueTaskMessage struct {
	Limit uint `json:"Limit,omitempty"`

	MediaID    string `json:"mediaId,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Size       string `json:"size,omitempty"`
	SourcePath string `json:"sourcePath,omitempty"`
}

func NewRefreshMetadataQueueJob(limit uint, options ...model.QueueJobOption) (model.QueueJob, error) {
	return model.NewQueueJob(
		queue.QueueNameRefreshMediaMeta,
		QueueTaskMessage{Limit: limit},
		append([]model.QueueJobOption{
			model.QueueJobMaxRetries(1),
			model.QueueJobPriority(refreshMetadataPriority),
		}, options...)...,
	)
}

func NewBackfillCoverQueueJob(limit uint, options ...model.QueueJobOption) (model.QueueJob, error) {
	return model.NewQueueJob(
		queue.QueueNameBackfillCoverCache,
		QueueTaskMessage{Limit: limit},
		append([]model.QueueJobOption{
			model.QueueJobMaxRetries(1),
			model.QueueJobPriority(backfillCoverPriority),
		}, options...)...,
	)
}

func NewGenerateCoverQueueJob(mediaID string, kind coverKind, size coverSize, sourcePath string, options ...model.QueueJobOption) (model.QueueJob, error) {
	return model.NewQueueJob(
		queue.QueueNameBackfillCoverCache,
		QueueTaskMessage{
			MediaID:    mediaID,
			Kind:       string(kind),
			Size:       string(size),
			SourcePath: sourcePath,
		},
		append([]model.QueueJobOption{
			model.QueueJobMaxRetries(1),
			model.QueueJobPriority(backfillCoverPriority),
		}, options...)...,
	)
}

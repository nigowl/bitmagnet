package manager

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/classifier"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/processor"
)

type PurgeJobsRequest struct {
	Queues   []string
	Statuses []model.QueueJobStatus
}

type EnqueueReprocessTorrentsBatchRequest struct {
	Purge               bool
	BatchSize           uint
	ChunkSize           uint
	ContentTypes        []model.NullContentType
	Orphans             bool
	ClassifyMode        processor.ClassifyMode
	ClassifierWorkflow  string
	ClassifierFlags     classifier.Flags
	ApisDisabled        bool
	LocalSearchDisabled bool
}

type EnqueueMaintenanceTaskRequest struct {
	TaskType string
	Limit    uint
	Purge    bool
}

type Manager interface {
	PurgeJobs(context.Context, PurgeJobsRequest) error
	EnqueueReprocessTorrentsBatch(context.Context, EnqueueReprocessTorrentsBatchRequest) error
	EnqueueMaintenanceTask(context.Context, EnqueueMaintenanceTaskRequest) error
}

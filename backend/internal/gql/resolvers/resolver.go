package resolvers

import (
	"github.com/nigowl/bitmagnet/internal/blocking"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/search"
	"github.com/nigowl/bitmagnet/internal/health"
	"github.com/nigowl/bitmagnet/internal/metrics/queuemetrics"
	"github.com/nigowl/bitmagnet/internal/metrics/torrentmetrics"
	"github.com/nigowl/bitmagnet/internal/processor"
	"github.com/nigowl/bitmagnet/internal/queue/manager"
	"github.com/nigowl/bitmagnet/internal/worker"
)

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require here.

type Resolver struct {
	Dao                  *dao.Query
	Search               search.Search
	Workers              worker.Registry
	Checker              health.Checker
	QueueMetricsClient   queuemetrics.Client
	QueueManager         manager.Manager
	TorrentMetricsClient torrentmetrics.Client
	Processor            processor.Processor
	BlockingManager      blocking.Manager
}

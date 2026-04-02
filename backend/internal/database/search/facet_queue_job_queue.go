package search

import (
	"strings"

	"github.com/nigowl/bitmagnet/internal/database/query"
	"github.com/nigowl/bitmagnet/internal/queue"
)

const QueueJobQueueFacetKey = "queue"

func QueueJobQueueFacet(options ...query.FacetOption) query.Facet {
	return queueJobQueueFacet{
		FacetConfig: query.NewFacetConfig(
			append([]query.FacetOption{
				query.FacetHasKey(QueueJobQueueFacetKey),
				query.FacetHasLabel("Queue"),
				query.FacetUsesOrLogic(),
			}, options...)...,
		),
	}
}

type queueJobQueueFacet struct {
	query.FacetConfig
}

var defaultQueueNames = []string{
	queue.QueueNameProcessTorrent,
	queue.QueueNameProcessTorrentBatch,
	queue.QueueNameRefreshMediaMeta,
	queue.QueueNameBackfillCoverCache,
}

func (queueJobQueueFacet) Values(ctx query.FacetContext) (map[string]string, error) {
	values := make(map[string]string)
	for _, n := range defaultQueueNames {
		values[n] = n
	}

	q := ctx.Query().QueueJob
	jobs, err := q.WithContext(ctx.Context()).Distinct(q.Queue).Find()
	if err != nil {
		return nil, err
	}

	for _, job := range jobs {
		name := strings.TrimSpace(job.Queue)
		if name == "" {
			continue
		}
		values[name] = name
	}

	return values, nil
}

func (queueJobQueueFacet) Criteria(filter query.FacetFilter) []query.Criteria {
	values := filter.Values()
	if len(values) == 0 {
		return nil
	}

	return []query.Criteria{
		QueueJobQueueCriteria(filter.Values()...),
	}
}

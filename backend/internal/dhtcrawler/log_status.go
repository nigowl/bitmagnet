package dhtcrawler

import (
	"context"
	"time"
)

func (c *crawler) logStatus(ctx context.Context) {
	if c.statusLogInterval <= 0 {
		return
	}

	ticker := time.NewTicker(c.statusLogInterval)
	defer ticker.Stop()

	c.logger.Infow(
		"dht crawler status logging enabled",
		"interval", c.statusLogInterval.String(),
		"bootstrap_nodes", len(c.bootstrapNodes),
		"bootstrap_dns_resolvers", len(c.bootstrapDNSResolvers),
	)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sample := c.kTable.SampleHashesAndNodes()
			c.logger.Infow(
				"dht crawler status",
				"discovered_nodes_queue", len(c.discoveredNodes.In()),
				"ping_queue", len(c.nodesForPing.In()),
				"find_node_queue", len(c.nodesForFindNode.In()),
				"sample_infohashes_queue", len(c.nodesForSampleInfoHashes.In()),
				"infohash_triage_queue", len(c.infoHashTriage.In()),
				"get_peers_queue", len(c.getPeers.In()),
				"scrape_queue", len(c.scrape.In()),
				"metainfo_queue", len(c.requestMetaInfo.In()),
				"persist_torrents_queue", len(c.persistTorrents.In()),
				"persist_sources_queue", len(c.persistSources.In()),
				"tracked_hashes", sample.TotalHashes,
				"sampled_hashes", len(sample.Hashes),
				"sampled_nodes", len(sample.Nodes),
			)
		}
	}
}

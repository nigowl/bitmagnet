package dhtcrawlerhealthcheck

import (
	"context"
	"errors"
	"time"

	"github.com/nigowl/bitmagnet/internal/concurrency"
	"github.com/nigowl/bitmagnet/internal/health"
	"github.com/nigowl/bitmagnet/internal/protocol/dht/server"
)

func NewCheck(
	dhtCrawlerActive *concurrency.AtomicValue[bool],
	lastResponses *concurrency.AtomicValue[server.LastResponses],
) health.Check {
	return health.Check{
		Name: "dht",
		IsActive: func() bool {
			return dhtCrawlerActive.Get()
		},
		Timeout: time.Second,
		Check: func(context.Context) error {
			lr := lastResponses.Get()
			if lr.StartTime.IsZero() {
				return nil
			}
			now := time.Now()
			if lr.LastSuccess.IsZero() {
				// Give bootstrap some time before reporting an unhealthy DHT state.
				if now.Sub(lr.StartTime) < 30*time.Second {
					return nil
				}
				if lr.LastResponse.IsZero() {
					return errors.New("no DHT responses within 30 seconds (bootstrap nodes may be unreachable)")
				}
				return errors.New("no successful DHT responses within 30 seconds (check DNS/UDP connectivity)")
			}
			if now.Sub(lr.LastSuccess) > time.Minute {
				return errors.New("no successful responses within last minute")
			}
			return nil
		},
	}
}

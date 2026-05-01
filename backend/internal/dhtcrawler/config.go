package dhtcrawler

import (
	"time"
)

type Config struct {
	// ScalingFactor is a rough proxy for resource usage of the crawler; concurrency and buffer size of the various
	// pipeline channels are multiplied by this value. Diminishing returns may result from exceeding the
	// default value of 10. Since the software has not been tested on a wide variety of hardware and network
	// conditions; your mileage may vary here...
	ScalingFactor                uint
	BootstrapNodes               []string
	BootstrapDNSResolvers        []string
	ReseedBootstrapNodesInterval time.Duration
	// SaveFilesThreshold specifies a maximum number of files in a torrent before file information is discarded.
	// Some torrents contain thousands of files which can severely impact performance and uses a lot of disk space.
	SaveFilesThreshold uint
	// SavePieces when true, torrent pieces will be persisted to the database.
	// The pieces take up quite a lot of space, and aren't currently very useful,
	// but they may be used by future features.
	SavePieces bool
	// RescrapeThreshold is the amount of time that must pass before a torrent is rescraped
	// to count seeders and leechers.
	RescrapeThreshold time.Duration
	// StatusLogInterval controls how often crawler pipeline status is written to logs.
	StatusLogInterval time.Duration
	// GetOldestNodesInterval controls how often crawler scans routing table for old nodes.
	GetOldestNodesInterval time.Duration
	// OldPeerThreshold controls minimum age for peers selected as "old nodes".
	OldPeerThreshold time.Duration
	// ScheduleEnabled restricts crawler runtime to configured local weekdays and hours.
	ScheduleEnabled bool
	// ScheduleWeekdays stores ISO weekdays where Monday is 1 and Sunday is 7.
	ScheduleWeekdays []int
	// ScheduleStartHour is the inclusive local hour when the crawler may start.
	ScheduleStartHour int
	// ScheduleEndHour is the exclusive local hour when the crawler must pause.
	ScheduleEndHour int
}

func NewDefaultConfig() Config {
	return Config{
		ScalingFactor:                10,
		BootstrapNodes:               defaultBootstrapNodes,
		BootstrapDNSResolvers:        defaultBootstrapDNSResolvers,
		ReseedBootstrapNodesInterval: time.Minute,
		SaveFilesThreshold:           100,
		SavePieces:                   false,
		RescrapeThreshold:            time.Hour * 24 * 30,
		StatusLogInterval:            45 * time.Second,
		GetOldestNodesInterval:       10 * time.Second,
		OldPeerThreshold:             15 * time.Minute,
		ScheduleEnabled:              false,
		ScheduleWeekdays:             []int{1, 2, 3, 4, 5, 6, 7},
		ScheduleStartHour:            0,
		ScheduleEndHour:              24,
	}
}

// https://github.com/anacrolix/dht/blob/92b36a3fa7a37a15e08684337b47d8d0fb322ab6/dht.go#L106
var defaultBootstrapNodes = []string{
	"router.utorrent.com:6881",
	"router.bittorrent.com:6881",
	"dht.transmissionbt.com:6881",
	"dht.aelitis.com:6881",     // Vuze
	"router.silotis.us:6881",   // IPv6
	"dht.libtorrent.org:25401", // @arvidn's
}

var defaultBootstrapDNSResolvers = []string{
	"https://cloudflare-dns.com/dns-query",
	"https://dns.google/dns-query",
	"https://dns.quad9.net/dns-query",
	"1.1.1.1:53",
	"8.8.8.8:53",
	"9.9.9.9:53",
}

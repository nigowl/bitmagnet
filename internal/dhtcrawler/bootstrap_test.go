package dhtcrawler

import (
	"net/netip"
	"testing"
)

func TestIsRejectedBootstrapAddr(t *testing.T) {
	tests := []struct {
		name     string
		addr     string
		rejected bool
	}{
		{
			name:     "public IPv4",
			addr:     "67.215.246.10",
			rejected: false,
		},
		{
			name:     "benchmark range IPv4",
			addr:     "198.18.1.127",
			rejected: true,
		},
		{
			name:     "private IPv4",
			addr:     "192.168.1.1",
			rejected: true,
		},
		{
			name:     "documentation IPv6",
			addr:     "2001:db8::1",
			rejected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			addr, err := netip.ParseAddr(tc.addr)
			if err != nil {
				t.Fatalf("parse address: %v", err)
			}

			if got := isRejectedBootstrapAddr(addr); got != tc.rejected {
				t.Fatalf("expected rejected=%t got=%t", tc.rejected, got)
			}
		})
	}
}

func TestFilterBootstrapAddrs(t *testing.T) {
	addrs := []netip.Addr{
		netip.MustParseAddr("198.18.1.127"),
		netip.MustParseAddr("67.215.246.10"),
		netip.MustParseAddr("67.215.246.10"),
		netip.MustParseAddr("104.244.43.182"),
	}

	filtered := filterBootstrapAddrs(addrs)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 routable addresses, got %d", len(filtered))
	}
}

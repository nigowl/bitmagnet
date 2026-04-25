package dhtcrawler

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"

	"golang.org/x/net/dns/dnsmessage"
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

func TestResolveBootstrapNodeAddressesUsesConfiguredDoHResolver(t *testing.T) {
	resolver := newTestDoHResolver(t, map[dnsmessage.Type][]netip.Addr{
		dnsmessage.TypeA: {
			netip.MustParseAddr("67.215.246.10"),
			netip.MustParseAddr("198.18.1.127"),
		},
	})

	addrs, err := resolveBootstrapNodeAddresses(
		context.Background(),
		"bootstrap.invalid:6881",
		[]string{resolver.URL},
	)
	if err != nil {
		t.Fatalf("resolve bootstrap node addresses: %v", err)
	}
	if len(addrs) != 1 {
		t.Fatalf("expected 1 routable address, got %d", len(addrs))
	}
	if got := addrs[0]; got != netip.MustParseAddrPort("67.215.246.10:6881") {
		t.Fatalf("expected 67.215.246.10:6881, got %s", got)
	}
}

func TestLookupBootstrapHostWithDoHResolver(t *testing.T) {
	resolver := newTestDoHResolver(t, map[dnsmessage.Type][]netip.Addr{
		dnsmessage.TypeA: {
			netip.MustParseAddr("67.215.246.10"),
		},
		dnsmessage.TypeAAAA: {
			netip.MustParseAddr("2001:4860:4860::8888"),
		},
	})

	addrs, err := lookupBootstrapHostWithResolver(context.Background(), resolver.URL, "bootstrap.test")
	if err != nil {
		t.Fatalf("lookup bootstrap host with DoH resolver: %v", err)
	}
	if len(addrs) != 2 {
		t.Fatalf("expected 2 addresses, got %d", len(addrs))
	}
}

func newTestDoHResolver(t *testing.T, answers map[dnsmessage.Type][]netip.Addr) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawQuery := r.URL.Query().Get("dns")
		query, err := base64.RawURLEncoding.DecodeString(rawQuery)
		if err != nil {
			t.Errorf("decode DoH query: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		var parser dnsmessage.Parser
		header, err := parser.Start(query)
		if err != nil {
			t.Errorf("parse DoH query header: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		question, err := parser.Question()
		if err != nil {
			t.Errorf("parse DoH question: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		msg := dnsmessage.Message{
			Header: dnsmessage.Header{
				ID:                 header.ID,
				Response:           true,
				RecursionDesired:   header.RecursionDesired,
				RecursionAvailable: true,
				RCode:              dnsmessage.RCodeSuccess,
			},
			Questions: []dnsmessage.Question{question},
		}

		for _, addr := range answers[question.Type] {
			msg.Answers = append(msg.Answers, newTestDNSResource(question, addr))
		}

		packed, err := msg.Pack()
		if err != nil {
			t.Errorf("pack DoH response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/dns-message")
		_, _ = w.Write(packed)
	}))
	t.Cleanup(server.Close)

	return server
}

func newTestDNSResource(question dnsmessage.Question, addr netip.Addr) dnsmessage.Resource {
	header := dnsmessage.ResourceHeader{
		Name:  question.Name,
		Class: dnsmessage.ClassINET,
		TTL:   60,
	}
	if addr.Is4() {
		header.Type = dnsmessage.TypeA
		return dnsmessage.Resource{
			Header: header,
			Body: &dnsmessage.AResource{
				A: addr.As4(),
			},
		}
	}

	header.Type = dnsmessage.TypeAAAA
	return dnsmessage.Resource{
		Header: header,
		Body: &dnsmessage.AAAAResource{
			AAAA: addr.As16(),
		},
	}
}

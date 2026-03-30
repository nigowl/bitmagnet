package dhtcrawler

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strconv"
	"time"

	"github.com/bitmagnet-io/bitmagnet/internal/protocol/dht/ktable"
)

var bootstrapDNSResolvers = []string{
	"1.1.1.1:53",
	"8.8.8.8:53",
	"9.9.9.9:53",
}

var rejectedBootstrapPrefixes = []netip.Prefix{
	mustPrefix("0.0.0.0/8"),
	mustPrefix("10.0.0.0/8"),
	mustPrefix("100.64.0.0/10"),
	mustPrefix("127.0.0.0/8"),
	mustPrefix("169.254.0.0/16"),
	mustPrefix("172.16.0.0/12"),
	mustPrefix("192.0.0.0/24"),
	mustPrefix("192.0.2.0/24"),
	mustPrefix("192.168.0.0/16"),
	mustPrefix("198.18.0.0/15"),
	mustPrefix("198.51.100.0/24"),
	mustPrefix("203.0.113.0/24"),
	mustPrefix("224.0.0.0/4"),
	mustPrefix("240.0.0.0/4"),
	mustPrefix("::/128"),
	mustPrefix("::1/128"),
	mustPrefix("2001:db8::/32"),
	mustPrefix("fc00::/7"),
	mustPrefix("ff00::/8"),
}

func (c *crawler) reseedBootstrapNodes(ctx context.Context) {
	interval := time.Duration(0)

	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
			resolvedAddrCount := 0
			queuedAddrCount := 0
			failedNodeCount := 0

			for _, strAddr := range c.bootstrapNodes {
				addrs, err := resolveBootstrapNodeAddresses(ctx, strAddr)
				if err != nil {
					failedNodeCount++
					c.logger.Warnf("failed to resolve bootstrap node address %q: %s", strAddr, err)
					continue
				}

				resolvedAddrCount += len(addrs)

				for _, addr := range addrs {
					select {
					case <-ctx.Done():
						return
					case c.nodesForPing.In() <- ktable.NewNode(ktable.ID{}, addr):
						queuedAddrCount++
						continue
					}
				}
			}

			c.logger.Infow(
				"dht bootstrap reseed complete",
				"configured_nodes", len(c.bootstrapNodes),
				"resolved_addresses", resolvedAddrCount,
				"queued_for_ping", queuedAddrCount,
				"failed_nodes", failedNodeCount,
				"next_reseed_in", c.reseedBootstrapNodesInterval.String(),
			)
		}

		interval = c.reseedBootstrapNodesInterval
	}
}

func resolveBootstrapNodeAddresses(ctx context.Context, value string) ([]netip.AddrPort, error) {
	host, port, err := splitBootstrapNodeAddress(value)
	if err != nil {
		return nil, err
	}

	if hostAddr, parseErr := netip.ParseAddr(host); parseErr == nil {
		if isRejectedBootstrapAddr(hostAddr) {
			return nil, fmt.Errorf("resolved IP is not routable for DHT: %s", hostAddr)
		}
		return []netip.AddrPort{netip.AddrPortFrom(hostAddr.Unmap(), port)}, nil
	}

	addrs, err := lookupBootstrapHost(ctx, net.DefaultResolver, host)
	if err != nil {
		return nil, fmt.Errorf("default DNS lookup failed: %w", err)
	}
	filtered := filterBootstrapAddrs(addrs)
	if len(filtered) > 0 {
		return toAddrPorts(filtered, port), nil
	}

	var lastErr error
	for _, resolverAddr := range bootstrapDNSResolvers {
		resolver := newDNSResolver(resolverAddr)
		addrs, lookupErr := lookupBootstrapHost(ctx, resolver, host)
		if lookupErr != nil {
			lastErr = lookupErr
			continue
		}

		filtered = filterBootstrapAddrs(addrs)
		if len(filtered) > 0 {
			return toAddrPorts(filtered, port), nil
		}

		lastErr = fmt.Errorf("resolver %s returned no routable addresses", resolverAddr)
	}

	if lastErr != nil {
		return nil, fmt.Errorf("no routable bootstrap addresses found: %w", lastErr)
	}

	return nil, errNoRoutableBootstrapAddress
}

var errNoRoutableBootstrapAddress = errors.New("no routable bootstrap addresses found")

func splitBootstrapNodeAddress(value string) (string, uint16, error) {
	host, portStr, err := net.SplitHostPort(value)
	if err != nil {
		return "", 0, err
	}

	port, err := strconv.ParseUint(portStr, 10, 16)
	if err != nil {
		return "", 0, err
	}

	return host, uint16(port), nil
}

func lookupBootstrapHost(
	ctx context.Context,
	resolver *net.Resolver,
	host string,
) ([]netip.Addr, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	addrs, err := resolver.LookupNetIP(lookupCtx, "ip", host)
	if err != nil {
		return nil, err
	}

	return addrs, nil
}

func newDNSResolver(addr string) *net.Resolver {
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			dialer := net.Dialer{Timeout: 2 * time.Second}
			return dialer.DialContext(ctx, network, addr)
		},
	}
}

func filterBootstrapAddrs(addrs []netip.Addr) []netip.Addr {
	seen := make(map[netip.Addr]struct{}, len(addrs))
	filtered := make([]netip.Addr, 0, len(addrs))
	for _, addr := range addrs {
		addr = addr.Unmap()
		if isRejectedBootstrapAddr(addr) {
			continue
		}
		if _, ok := seen[addr]; ok {
			continue
		}
		seen[addr] = struct{}{}
		filtered = append(filtered, addr)
	}

	return filtered
}

func toAddrPorts(addrs []netip.Addr, port uint16) []netip.AddrPort {
	addrPorts := make([]netip.AddrPort, 0, len(addrs))
	for _, addr := range addrs {
		addrPorts = append(addrPorts, netip.AddrPortFrom(addr, port))
	}

	return addrPorts
}

func isRejectedBootstrapAddr(addr netip.Addr) bool {
	if !addr.IsValid() || !addr.IsGlobalUnicast() {
		return true
	}

	for _, prefix := range rejectedBootstrapPrefixes {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}

func mustPrefix(value string) netip.Prefix {
	prefix, err := netip.ParsePrefix(value)
	if err != nil {
		panic(err)
	}

	return prefix
}

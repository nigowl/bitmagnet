package dhtcrawler

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/protocol/dht/ktable"
	"golang.org/x/net/dns/dnsmessage"
)

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
				addrs, err := resolveBootstrapNodeAddresses(ctx, strAddr, c.bootstrapDNSResolvers)
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

func resolveBootstrapNodeAddresses(ctx context.Context, value string, resolverSpecs []string) ([]netip.AddrPort, error) {
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

	addrs, err := lookupBootstrapHostWithDefaultResolver(ctx, host)
	var lastErr error
	if err != nil {
		lastErr = fmt.Errorf("default DNS lookup failed: %w", err)
	} else {
		filtered := filterBootstrapAddrs(addrs)
		if len(filtered) > 0 {
			return toAddrPorts(filtered, port), nil
		}
	}

	if len(resolverSpecs) == 0 {
		resolverSpecs = defaultBootstrapDNSResolvers
	}

	for _, resolverSpec := range resolverSpecs {
		addrs, lookupErr := lookupBootstrapHostWithResolver(ctx, resolverSpec, host)
		if lookupErr != nil {
			lastErr = lookupErr
			continue
		}

		filtered := filterBootstrapAddrs(addrs)
		if len(filtered) > 0 {
			return toAddrPorts(filtered, port), nil
		}

		lastErr = fmt.Errorf("resolver %s returned no routable addresses", resolverSpec)
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

func lookupBootstrapHostWithDefaultResolver(ctx context.Context, host string) ([]netip.Addr, error) {
	return lookupBootstrapHostWithDNSResolver(ctx, net.DefaultResolver, host)
}

func lookupBootstrapHostWithResolver(ctx context.Context, resolverSpec string, host string) ([]netip.Addr, error) {
	resolverSpec = strings.TrimSpace(resolverSpec)
	if resolverSpec == "" {
		return nil, errors.New("empty bootstrap DNS resolver")
	}

	if u, err := url.Parse(resolverSpec); err == nil {
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			return lookupBootstrapHostWithDoH(ctx, resolverSpec, host)
		case "udp", "tcp":
			if u.Host == "" {
				return nil, fmt.Errorf("resolver %s missing host", resolverSpec)
			}
			return lookupBootstrapHostWithDNSResolver(ctx, newDNSResolver(u.Host, u.Scheme), host)
		}
	}

	return lookupBootstrapHostWithDNSResolver(ctx, newDNSResolver(resolverSpec, ""), host)
}

func lookupBootstrapHostWithDNSResolver(
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

func newDNSResolver(addr string, forcedNetwork string) *net.Resolver {
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			if forcedNetwork != "" {
				network = strings.ToLower(forcedNetwork)
			}
			dialer := net.Dialer{Timeout: 2 * time.Second}
			return dialer.DialContext(ctx, network, addr)
		},
	}
}

func lookupBootstrapHostWithDoH(ctx context.Context, endpoint string, host string) ([]netip.Addr, error) {
	var addrs []netip.Addr
	var errs []error

	for _, queryType := range []dnsmessage.Type{dnsmessage.TypeA, dnsmessage.TypeAAAA} {
		queryAddrs, err := lookupBootstrapHostWithDoHType(ctx, endpoint, host, queryType)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		addrs = append(addrs, queryAddrs...)
	}

	if len(addrs) > 0 {
		return addrs, nil
	}

	return nil, errors.Join(errs...)
}

func lookupBootstrapHostWithDoHType(
	ctx context.Context,
	endpoint string,
	host string,
	queryType dnsmessage.Type,
) ([]netip.Addr, error) {
	name, err := dnsmessage.NewName(ensureFullyQualifiedDNSName(host))
	if err != nil {
		return nil, err
	}

	queryMessage := dnsmessage.Message{
		Header: dnsmessage.Header{
			RecursionDesired: true,
		},
		Questions: []dnsmessage.Question{
			{
				Name:  name,
				Type:  queryType,
				Class: dnsmessage.ClassINET,
			},
		},
	}
	query, err := queryMessage.Pack()
	if err != nil {
		return nil, err
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	params := u.Query()
	params.Set("dns", base64.RawURLEncoding.EncodeToString(query))
	u.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/dns-message")

	lookupCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req = req.WithContext(lookupCtx)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("DoH resolver returned status %s", res.Status)
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, 65536))
	if err != nil {
		return nil, err
	}

	var parser dnsmessage.Parser
	header, err := parser.Start(body)
	if err != nil {
		return nil, err
	}
	if header.RCode != dnsmessage.RCodeSuccess {
		return nil, fmt.Errorf("DoH resolver returned response code %s", header.RCode.String())
	}
	if err := parser.SkipAllQuestions(); err != nil {
		return nil, err
	}

	var addrs []netip.Addr
	for {
		answerHeader, err := parser.AnswerHeader()
		if errors.Is(err, dnsmessage.ErrSectionDone) {
			break
		}
		if err != nil {
			return nil, err
		}

		switch answerHeader.Type {
		case dnsmessage.TypeA:
			answer, err := parser.AResource()
			if err != nil {
				return nil, err
			}
			addrs = append(addrs, netip.AddrFrom4(answer.A))
		case dnsmessage.TypeAAAA:
			answer, err := parser.AAAAResource()
			if err != nil {
				return nil, err
			}
			addrs = append(addrs, netip.AddrFrom16(answer.AAAA))
		default:
			if err := parser.SkipAnswer(); err != nil {
				return nil, err
			}
		}
	}

	return addrs, nil
}

func ensureFullyQualifiedDNSName(host string) string {
	if strings.HasSuffix(host, ".") {
		return host
	}

	return host + "."
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

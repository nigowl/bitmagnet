package postgres

import (
	"strings"
	"testing"
)

func TestCreateConnectionDSNExcludesStructuredPoolSettings(t *testing.T) {
	cfg := Config{
		Host:                             "localhost",
		User:                             "postgres",
		Port:                             5432,
		Name:                             "bitmagnet",
		PoolMaxConns:                     12,
		PoolMinConns:                     2,
		PoolMaxConnLifetimeSeconds:       1800,
		PoolMaxConnLifetimeJitterSeconds: 300,
		PoolMaxConnIdleTimeSeconds:       300,
		PoolHealthCheckPeriodSeconds:     15,
	}

	dsn := cfg.CreateConnectionDSN()
	assertContains(t, dsn, "host=localhost")
	assertContains(t, dsn, "user=postgres")
	assertNotContains(t, dsn, "pool_max_conns")
	assertNotContains(t, dsn, "pool_health_check_period")
}

func TestCreateConnectionDSNStripsPoolSettingsFromKeywordDSN(t *testing.T) {
	cfg := Config{
		DSN: "host=localhost user=postgres pool_max_conns=12 pool_health_check_period=15",
	}

	dsn := cfg.CreateConnectionDSN()
	assertContains(t, dsn, "host=localhost")
	assertContains(t, dsn, "user=postgres")
	assertNotContains(t, dsn, "pool_max_conns")
	assertNotContains(t, dsn, "pool_health_check_period")
}

func TestCreateConnectionDSNStripsPoolSettingsFromURLDSN(t *testing.T) {
	cfg := Config{
		DSN: "postgres://postgres:secret@localhost:5432/bitmagnet?sslmode=disable&pool_max_conns=12",
	}

	dsn := cfg.CreateConnectionDSN()
	assertContains(t, dsn, "sslmode=disable")
	assertNotContains(t, dsn, "pool_max_conns")
}

func assertContains(t *testing.T, s string, want string) {
	t.Helper()
	if !strings.Contains(s, want) {
		t.Fatalf("expected %q to contain %q", s, want)
	}
}

func assertNotContains(t *testing.T, s string, want string) {
	t.Helper()
	if strings.Contains(s, want) {
		t.Fatalf("expected %q not to contain %q", s, want)
	}
}

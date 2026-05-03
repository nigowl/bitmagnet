package postgres

import (
	"fmt"
	"strings"
)

type Config struct {
	DSN                              string
	Host                             string
	User                             string
	Port                             uint
	Name                             string
	TablePrefix                      string
	ConnectionTimeout                uint
	PoolMaxConns                     uint
	PoolMinConns                     uint
	PoolMaxConnLifetimeSeconds       uint
	PoolMaxConnLifetimeJitterSeconds uint
	PoolMaxConnIdleTimeSeconds       uint
	PoolHealthCheckPeriodSeconds     uint
	Password                         string
	SSLMode                          string
	SSLCertPath                      string
	SSLKeyPath                       string
	SSLRootCertPath                  string
}

func NewDefaultConfig() Config {
	return Config{
		Host:                             "localhost",
		User:                             "postgres",
		Port:                             5432,
		Name:                             "bitmagnet",
		TablePrefix:                      "bm_",
		ConnectionTimeout:                10,
		PoolMaxConnLifetimeSeconds:       1800,
		PoolMaxConnLifetimeJitterSeconds: 300,
		PoolMaxConnIdleTimeSeconds:       300,
		PoolHealthCheckPeriodSeconds:     15,
	}
}

func (c *Config) CreateDSN() string {
	if c.DSN != "" {
		return c.DSN
	}

	vals := dbValues(c)
	p := make([]string, 0, len(vals))

	for k, v := range vals {
		p = append(p, fmt.Sprintf("%s=%s", k, v))
	}

	return strings.Join(p, " ")
}

func setIfNotEmpty(m map[string]string, key string, val interface{}) {
	strVal := fmt.Sprintf("%v", val)
	if strVal != "" {
		m[key] = strVal
	}
}

func setIfPositive(m map[string]string, key string, val uint) {
	if val > 0 {
		m[key] = fmt.Sprintf("%d", val)
	}
}

func setDurationSecondsIfPositive(m map[string]string, key string, val uint) {
	if val > 0 {
		m[key] = fmt.Sprintf("%ds", val)
	}
}

func dbValues(cfg *Config) map[string]string {
	p := map[string]string{}
	setIfNotEmpty(p, "dbname", cfg.Name)
	setIfNotEmpty(p, "user", cfg.User)
	setIfNotEmpty(p, "host", cfg.Host)
	setIfNotEmpty(p, "port", fmt.Sprintf("%d", cfg.Port))
	setIfNotEmpty(p, "sslmode", cfg.SSLMode)
	setIfPositive(p, "connect_timeout", cfg.ConnectionTimeout)
	setIfPositive(p, "pool_max_conns", cfg.PoolMaxConns)
	setIfPositive(p, "pool_min_conns", cfg.PoolMinConns)
	setDurationSecondsIfPositive(p, "pool_max_conn_lifetime", cfg.PoolMaxConnLifetimeSeconds)
	setDurationSecondsIfPositive(p, "pool_max_conn_lifetime_jitter", cfg.PoolMaxConnLifetimeJitterSeconds)
	setDurationSecondsIfPositive(p, "pool_max_conn_idle_time", cfg.PoolMaxConnIdleTimeSeconds)
	setDurationSecondsIfPositive(p, "pool_health_check_period", cfg.PoolHealthCheckPeriodSeconds)
	setIfNotEmpty(p, "password", cfg.Password)
	setIfNotEmpty(p, "sslcert", cfg.SSLCertPath)
	setIfNotEmpty(p, "sslkey", cfg.SSLKeyPath)
	setIfNotEmpty(p, "sslrootcert", cfg.SSLRootCertPath)

	return p
}

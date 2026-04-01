package auth

import "time"

type Config struct {
	TokenSecret            string
	TokenTTL               time.Duration
	AllowRegistration      bool
	BootstrapAdminUsername string
	BootstrapAdminPassword string
}

func NewDefaultConfig() Config {
	return Config{
		TokenSecret:            "bitmagnet-dev-secret",
		TokenTTL:               30 * 24 * time.Hour,
		AllowRegistration:      true,
		BootstrapAdminUsername: "admin",
		BootstrapAdminPassword: "admin123",
	}
}

package logging

import (
	"strings"
)

const (
	LogCategoryHTTPServer  = "http_server"
	LogCategoryQueueServer = "queue_server"
	LogCategoryDHTServer   = "dht_server"
)

type logCategory struct {
	Key      string
	BaseName string
}

func logCategories(config FileRotatorConfig) []logCategory {
	return []logCategory{
		{Key: LogCategoryHTTPServer, BaseName: categoryBaseName(config.BaseName, LogCategoryHTTPServer)},
		{Key: LogCategoryQueueServer, BaseName: categoryBaseName(config.BaseName, LogCategoryQueueServer)},
		{Key: LogCategoryDHTServer, BaseName: categoryBaseName(config.BaseName, LogCategoryDHTServer)},
	}
}

func availableLogCategoryKeys() []string {
	return []string{
		LogCategoryHTTPServer,
		LogCategoryQueueServer,
		LogCategoryDHTServer,
	}
}

func normalizeLogCategory(category string) string {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case LogCategoryHTTPServer:
		return LogCategoryHTTPServer
	case LogCategoryQueueServer:
		return LogCategoryQueueServer
	case LogCategoryDHTServer:
		return LogCategoryDHTServer
	default:
		return LogCategoryHTTPServer
	}
}

func loggerCategory(loggerName string) string {
	name := strings.ToLower(strings.TrimSpace(loggerName))

	switch {
	case strings.Contains(name, "dht"):
		return LogCategoryDHTServer
	case strings.Contains(name, "queue"),
		strings.HasPrefix(name, "media_service"),
		strings.HasPrefix(name, "media_site_plugins"),
		strings.Contains(name, "site_plugins"):
		return LogCategoryQueueServer
	default:
		return LogCategoryHTTPServer
	}
}

func categoryBaseName(baseName string, categorySuffix string) string {
	baseName = strings.TrimSpace(baseName)
	categorySuffix = strings.TrimSpace(categorySuffix)

	if categorySuffix == "" {
		return baseName
	}
	if baseName == "" {
		return categorySuffix
	}

	return baseName + "-" + categorySuffix
}

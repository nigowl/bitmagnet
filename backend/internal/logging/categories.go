package logging

import (
	"strings"
)

const (
	LogCategoryMain        = "main"
	LogCategoryDHT         = "dht"
	LogCategorySitePlugins = "site_plugins"
)

type logCategory struct {
	Key      string
	BaseName string
}

func logCategories(config FileRotatorConfig) []logCategory {
	return []logCategory{
		{Key: LogCategoryMain, BaseName: categoryBaseName(config.BaseName, "main")},
		{Key: LogCategoryDHT, BaseName: categoryBaseName(config.BaseName, "dht")},
		{Key: LogCategorySitePlugins, BaseName: categoryBaseName(config.BaseName, "site_plugins")},
	}
}

func availableLogCategoryKeys() []string {
	return []string{
		LogCategoryMain,
		LogCategoryDHT,
		LogCategorySitePlugins,
	}
}

func normalizeLogCategory(category string) string {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case LogCategoryMain:
		return LogCategoryMain
	case LogCategoryDHT:
		return LogCategoryDHT
	case LogCategorySitePlugins:
		return LogCategorySitePlugins
	default:
		return LogCategoryMain
	}
}

func loggerCategory(loggerName string) string {
	name := strings.ToLower(strings.TrimSpace(loggerName))

	switch {
	case strings.Contains(name, "dht"):
		return LogCategoryDHT
	case strings.HasPrefix(name, "media_site_plugins"), strings.Contains(name, "site_plugins"):
		return LogCategorySitePlugins
	default:
		return LogCategoryMain
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

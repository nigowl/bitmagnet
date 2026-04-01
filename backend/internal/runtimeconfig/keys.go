package runtimeconfig

import "strings"

const (
	KeySystemLogLevel = "system.log.level"

	KeyMediaTMDBEnabled = "system.media.site_plugins.tmdb.enabled"
	KeyMediaIMDbEnabled = "system.media.site_plugins.imdb.enabled"

	KeyMediaDoubanEnabled        = "system.media.douban.enabled"
	KeyMediaDoubanMinScore       = "system.media.douban.min_score"
	KeyMediaDoubanCookie         = "system.media.douban.cookie"
	KeyMediaDoubanUserAgent      = "system.media.douban.user_agent"
	KeyMediaDoubanAcceptLanguage = "system.media.douban.accept_language"
	KeyMediaDoubanReferer        = "system.media.douban.referer"
)

func AdminEditableKeys() []string {
	return []string{
		KeySystemLogLevel,
		KeyMediaTMDBEnabled,
		KeyMediaIMDbEnabled,
		KeyMediaDoubanEnabled,
		KeyMediaDoubanMinScore,
		KeyMediaDoubanCookie,
		KeyMediaDoubanUserAgent,
		KeyMediaDoubanAcceptLanguage,
		KeyMediaDoubanReferer,
	}
}

func DoubanKeys() []string {
	return []string{
		KeyMediaDoubanEnabled,
		KeyMediaDoubanMinScore,
		KeyMediaDoubanCookie,
		KeyMediaDoubanUserAgent,
		KeyMediaDoubanAcceptLanguage,
		KeyMediaDoubanReferer,
	}
}

func SitePluginEnabledKeys() []string {
	return []string{
		KeyMediaTMDBEnabled,
		KeyMediaIMDbEnabled,
		KeyMediaDoubanEnabled,
	}
}

func SitePluginEnabledKey(pluginKey string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(pluginKey)) {
	case "tmdb":
		return KeyMediaTMDBEnabled, true
	case "imdb":
		return KeyMediaIMDbEnabled, true
	case "douban":
		return KeyMediaDoubanEnabled, true
	default:
		return "", false
	}
}

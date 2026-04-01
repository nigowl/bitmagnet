package media

import "time"

type Config struct {
	CacheDir             string
	ImageBaseURL         string
	HTTPTimeout          time.Duration
	TMDBEnabled          bool
	IMDbEnabled          bool
	DoubanEnabled        bool
	DoubanSuggestURL     string
	DoubanSearchURL      string
	DoubanMinScore       float64
	DoubanCookie         string
	DoubanUserAgent      string
	DoubanAcceptLanguage string
	DoubanReferer        string
}

func NewDefaultConfig() Config {
	return Config{
		CacheDir:             "data/cache",
		ImageBaseURL:         "https://image.tmdb.org/t/p",
		HTTPTimeout:          20 * time.Second,
		TMDBEnabled:          true,
		IMDbEnabled:          true,
		DoubanEnabled:        true,
		DoubanSuggestURL:     "https://movie.douban.com/j/subject_suggest",
		DoubanSearchURL:      "https://movie.douban.com/subject_search",
		DoubanMinScore:       0.62,
		DoubanUserAgent:      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
		DoubanAcceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
		DoubanReferer:        "https://movie.douban.com/",
	}
}

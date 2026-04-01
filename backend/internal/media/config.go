package media

import "time"

type Config struct {
	CacheDir         string
	ImageBaseURL     string
	HTTPTimeout      time.Duration
	DoubanEnabled    bool
	DoubanSuggestURL string
	DoubanMinScore   float64
}

func NewDefaultConfig() Config {
	return Config{
		CacheDir:         "data/cache",
		ImageBaseURL:     "https://image.tmdb.org/t/p",
		HTTPTimeout:      20 * time.Second,
		DoubanEnabled:    true,
		DoubanSuggestURL: "https://movie.douban.com/j/subject_suggest",
		DoubanMinScore:   0.62,
	}
}

package media

import "time"

type ListInput struct {
	Category string
	Search   string
	Quality  string
	Year     string
	Genre    string
	Language string
	Country  string
	Network  string
	Studio   string
	Awards   string
	Sort     string
	Limit    int
	Page     int
}

type ListResult struct {
	TotalCount        int64      `json:"totalCount"`
	TotalTorrentCount int64      `json:"totalTorrentCount"`
	Items             []ListItem `json:"items"`
}

type ListItem struct {
	ID                  string           `json:"id"`
	ContentType         string           `json:"contentType"`
	Title               string           `json:"title"`
	NameOriginal        *string          `json:"nameOriginal,omitempty"`
	NameEn              *string          `json:"nameEn,omitempty"`
	NameZh              *string          `json:"nameZh,omitempty"`
	OverviewOriginal    *string          `json:"overviewOriginal,omitempty"`
	OverviewEn          *string          `json:"overviewEn,omitempty"`
	OverviewZh          *string          `json:"overviewZh,omitempty"`
	Tagline             *string          `json:"tagline,omitempty"`
	StatusText          *string          `json:"statusText,omitempty"`
	HomepageURL         *string          `json:"homepageUrl,omitempty"`
	ReleaseYear         *int             `json:"releaseYear,omitempty"`
	PosterPath          *string          `json:"posterPath,omitempty"`
	BackdropPath        *string          `json:"backdropPath,omitempty"`
	VoteAverage         *float32         `json:"voteAverage,omitempty"`
	VoteCount           *uint            `json:"voteCount,omitempty"`
	IMDbID              *string          `json:"imdbId,omitempty"`
	DoubanID            *string          `json:"doubanId,omitempty"`
	Genres              []string         `json:"genres"`
	Languages           []string         `json:"languages"`
	ProductionCountries []string         `json:"productionCountries"`
	SpokenLanguages     []string         `json:"spokenLanguages"`
	PremiereDates       []string         `json:"premiereDates"`
	SeasonCount         *uint            `json:"seasonCount,omitempty"`
	EpisodeCount        *uint            `json:"episodeCount,omitempty"`
	NetworkNames        []string         `json:"networkNames"`
	StudioNames         []string         `json:"studioNames"`
	AwardNames          []string         `json:"awardNames"`
	CreatorNames        []string         `json:"creatorNames"`
	TitleAliases        []string         `json:"titleAliases"`
	Certification       *string          `json:"certification,omitempty"`
	CastMembers         []string         `json:"castMembers"`
	DirectorNames       []string         `json:"directorNames"`
	WriterNames         []string         `json:"writerNames"`
	QualityTags         []string         `json:"qualityTags"`
	Collections         []ListCollection `json:"collections"`
	Attributes          []ListAttribute  `json:"attributes"`
	IsAnime             bool             `json:"isAnime"`
	TorrentCount        uint             `json:"torrentCount"`
	MaxSeeders          *uint            `json:"maxSeeders,omitempty"`
	LatestPublishedAt   *time.Time       `json:"latestPublishedAt,omitempty"`
	UpdatedAt           time.Time        `json:"updatedAt"`
}

type ListCollection struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type ListAttribute struct {
	Source string `json:"source"`
	Key    string `json:"key"`
	Value  string `json:"value"`
}

type DetailResult struct {
	Item     DetailItem      `json:"item"`
	Torrents []DetailTorrent `json:"torrents"`
}

type DetailOptions struct {
	ForceRefresh bool
	PluginKeys   []string
}

type DetailItem struct {
	ID                  string             `json:"id"`
	ContentType         string             `json:"contentType"`
	ContentSource       string             `json:"contentSource"`
	ContentID           string             `json:"contentId"`
	Title               string             `json:"title"`
	NameOriginal        *string            `json:"nameOriginal,omitempty"`
	NameEn              *string            `json:"nameEn,omitempty"`
	NameZh              *string            `json:"nameZh,omitempty"`
	OverviewOriginal    *string            `json:"overviewOriginal,omitempty"`
	OverviewEn          *string            `json:"overviewEn,omitempty"`
	OverviewZh          *string            `json:"overviewZh,omitempty"`
	Tagline             *string            `json:"tagline,omitempty"`
	StatusText          *string            `json:"statusText,omitempty"`
	HomepageURL         *string            `json:"homepageUrl,omitempty"`
	OriginalLanguage    *string            `json:"originalLanguage,omitempty"`
	ReleaseDate         *string            `json:"releaseDate,omitempty"`
	ReleaseYear         *int               `json:"releaseYear,omitempty"`
	Runtime             *uint16            `json:"runtime,omitempty"`
	Popularity          *float32           `json:"popularity,omitempty"`
	VoteAverage         *float32           `json:"voteAverage,omitempty"`
	VoteCount           *uint              `json:"voteCount,omitempty"`
	IMDbID              *string            `json:"imdbId,omitempty"`
	DoubanID            *string            `json:"doubanId,omitempty"`
	PosterPath          *string            `json:"posterPath,omitempty"`
	BackdropPath        *string            `json:"backdropPath,omitempty"`
	Genres              []string           `json:"genres"`
	ProductionCountries []string           `json:"productionCountries"`
	SpokenLanguages     []string           `json:"spokenLanguages"`
	PremiereDates       []string           `json:"premiereDates"`
	SeasonCount         *uint              `json:"seasonCount,omitempty"`
	EpisodeCount        *uint              `json:"episodeCount,omitempty"`
	NetworkNames        []string           `json:"networkNames"`
	StudioNames         []string           `json:"studioNames"`
	AwardNames          []string           `json:"awardNames"`
	CreatorNames        []string           `json:"creatorNames"`
	TitleAliases        []string           `json:"titleAliases"`
	Certification       *string            `json:"certification,omitempty"`
	CastMembers         []string           `json:"castMembers"`
	DirectorNames       []string           `json:"directorNames"`
	WriterNames         []string           `json:"writerNames"`
	QualityTags         []string           `json:"qualityTags"`
	IsAnime             bool               `json:"isAnime"`
	TorrentCount        uint               `json:"torrentCount"`
	MaxSeeders          *uint              `json:"maxSeeders,omitempty"`
	LatestPublishedAt   *time.Time         `json:"latestPublishedAt,omitempty"`
	Collections         []DetailCollection `json:"collections"`
	Attributes          []DetailAttribute  `json:"attributes"`
	Languages           []DetailLanguage   `json:"languages"`
}

type DetailCollection struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type DetailAttribute struct {
	Source string `json:"source"`
	Key    string `json:"key"`
	Value  string `json:"value"`
}

type DetailLanguage struct {
	ID   *string `json:"id,omitempty"`
	Name string  `json:"name"`
}

type DetailSource struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

type DetailTorrent struct {
	InfoHash        string           `json:"infoHash"`
	Title           string           `json:"title"`
	Seeders         *uint            `json:"seeders,omitempty"`
	Leechers        *uint            `json:"leechers,omitempty"`
	Size            uint             `json:"size"`
	FilesCount      *uint            `json:"filesCount,omitempty"`
	VideoResolution *string          `json:"videoResolution,omitempty"`
	VideoSource     *string          `json:"videoSource,omitempty"`
	PublishedAt     time.Time        `json:"publishedAt"`
	UpdatedAt       time.Time        `json:"updatedAt"`
	Languages       []DetailLanguage `json:"languages"`
	Torrent         struct {
		Name       string         `json:"name"`
		Size       uint           `json:"size"`
		FilesCount *uint          `json:"filesCount,omitempty"`
		SingleFile bool           `json:"singleFile"`
		FileType   *string        `json:"fileType,omitempty"`
		MagnetURI  string         `json:"magnetUri"`
		TagNames   []string       `json:"tagNames"`
		Sources    []DetailSource `json:"sources"`
	} `json:"torrent"`
}

type CoverResult struct {
	FilePath string `json:"filePath"`
}

type BackfillLocalizedInput struct {
	Limit    int                        `json:"limit"`
	Progress func(BackfillProgressInfo) `json:"-"`
}

type BackfillLocalizedResult struct {
	Requested  int   `json:"requested"`
	Processed  int   `json:"processed"`
	Updated    int   `json:"updated"`
	Remaining  int   `json:"remaining"`
	DurationMs int64 `json:"durationMs"`
}

type BackfillCoverCacheInput struct {
	Limit    int                        `json:"limit"`
	Progress func(BackfillProgressInfo) `json:"-"`
}

type BackfillCoverCacheResult struct {
	Requested  int   `json:"requested"`
	Processed  int   `json:"processed"`
	Updated    int   `json:"updated"`
	Remaining  int   `json:"remaining"`
	Failed     int   `json:"failed"`
	DurationMs int64 `json:"durationMs"`
}

type BackfillProgressInfo struct {
	Requested int    `json:"requested"`
	Processed int    `json:"processed"`
	Updated   int    `json:"updated"`
	Remaining int    `json:"remaining"`
	CurrentID string `json:"currentId,omitempty"`
	Message   string `json:"message,omitempty"`
}

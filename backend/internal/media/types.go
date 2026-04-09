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
	ScoreMin *float64
	ScoreMax *float64
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
	Item              DetailItem               `json:"item"`
	Torrents          []DetailTorrent          `json:"torrents"`
	SubtitleTemplates []DetailSubtitleTemplate `json:"subtitleTemplates"`
	PlayerEnabled     bool                     `json:"playerEnabled"`
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

type DetailSubtitleTemplate struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URLTemplate string `json:"urlTemplate"`
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

type PlayerTransmissionBootstrapInput struct {
	InfoHash string `json:"infoHash"`
}

type PlayerTransmissionBootstrapResult struct {
	InfoHash          string                         `json:"infoHash"`
	TorrentID         int64                          `json:"torrentId"`
	SelectedFileIndex int                            `json:"selectedFileIndex"`
	StreamURL         string                         `json:"streamUrl"`
	TranscodeEnabled  bool                           `json:"transcodeEnabled"`
	Status            PlayerTransmissionStatusResult `json:"status"`
}

type PlayerTransmissionSelectFileInput struct {
	InfoHash  string `json:"infoHash"`
	FileIndex int    `json:"fileIndex"`
}

type PlayerTransmissionSelectFileResult struct {
	InfoHash          string                         `json:"infoHash"`
	SelectedFileIndex int                            `json:"selectedFileIndex"`
	StreamURL         string                         `json:"streamUrl"`
	TranscodeEnabled  bool                           `json:"transcodeEnabled"`
	Status            PlayerTransmissionStatusResult `json:"status"`
}

type PlayerTransmissionAudioTracksInput struct {
	InfoHash  string `json:"infoHash"`
	FileIndex int    `json:"fileIndex"`
}

type PlayerTransmissionAudioTrack struct {
	Index       int    `json:"index"`
	StreamIndex int    `json:"streamIndex"`
	Label       string `json:"label"`
	Language    string `json:"language"`
	Codec       string `json:"codec"`
	Channels    int    `json:"channels"`
	Default     bool   `json:"default"`
}

type PlayerTransmissionAudioTracksResult struct {
	InfoHash  string                         `json:"infoHash"`
	FileIndex int                            `json:"fileIndex"`
	Tracks    []PlayerTransmissionAudioTrack `json:"tracks"`
}

type PlayerSubtitle struct {
	ID            int64     `json:"id"`
	InfoHash      string    `json:"infoHash"`
	Label         string    `json:"label"`
	Language      string    `json:"language"`
	OffsetSeconds float64   `json:"offsetSeconds"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type PlayerSubtitleListInput struct {
	InfoHash string `json:"infoHash"`
}

type PlayerSubtitleCreateInput struct {
	InfoHash   string `json:"infoHash"`
	Label      string `json:"label"`
	Language   string `json:"language"`
	ContentVTT string `json:"contentVtt"`
}

type PlayerSubtitleUpdateInput struct {
	InfoHash      string   `json:"infoHash"`
	ID            int64    `json:"id"`
	Label         *string  `json:"label"`
	Language      *string  `json:"language"`
	OffsetSeconds *float64 `json:"offsetSeconds"`
}

type PlayerSubtitleDeleteInput struct {
	InfoHash string `json:"infoHash"`
	ID       int64  `json:"id"`
}

type PlayerSubtitleContentInput struct {
	InfoHash string `json:"infoHash"`
	ID       int64  `json:"id"`
}

type PlayerSubtitleContentResult struct {
	ContentVTT string `json:"contentVtt"`
	UpdatedAt  time.Time
}

type PlayerFFmpegTranscodeSettings struct {
	Enabled          bool   `json:"enabled"`
	BinaryPath       string `json:"binaryPath"`
	Preset           string `json:"preset"`
	CRF              int    `json:"crf"`
	AudioBitrateKbps int    `json:"audioBitrateKbps"`
	Threads          int    `json:"threads"`
	ExtraArgs        string `json:"extraArgs"`
}

type PlayerTransmissionStatusInput struct {
	InfoHash string `json:"infoHash"`
}

type PlayerTransmissionBatchStatusInput struct {
	InfoHashes []string `json:"infoHashes"`
}

type PlayerTransmissionBatchStatusResult struct {
	Items []PlayerTransmissionTaskStatus `json:"items"`
}

type PlayerTransmissionTaskStatus struct {
	InfoHash  string  `json:"infoHash"`
	Exists    bool    `json:"exists"`
	TorrentID int64   `json:"torrentId"`
	State     string  `json:"state"`
	Progress  float64 `json:"progress"`
}

type PlayerTransmissionStatusResult struct {
	InfoHash                    string                   `json:"infoHash"`
	TorrentID                   int64                    `json:"torrentId"`
	Name                        string                   `json:"name"`
	State                       string                   `json:"state"`
	Progress                    float64                  `json:"progress"`
	DownloadRate                int64                    `json:"downloadRate"`
	UploadRate                  int64                    `json:"uploadRate"`
	PeersConnected              int                      `json:"peersConnected"`
	ErrorCode                   int                      `json:"errorCode"`
	ErrorMessage                string                   `json:"errorMessage"`
	SelectedFileIndex           int                      `json:"selectedFileIndex"`
	SelectedFileBytesCompleted  int64                    `json:"selectedFileBytesCompleted"`
	SelectedFileLength          int64                    `json:"selectedFileLength"`
	SelectedFileReadyRatio      float64                  `json:"selectedFileReadyRatio"`
	SelectedFileContiguousBytes int64                    `json:"selectedFileContiguousBytes"`
	SelectedFileContiguousRatio float64                  `json:"selectedFileContiguousRatio"`
	SelectedFileAvailableRanges []PlayerFileRange        `json:"selectedFileAvailableRanges"`
	SequentialDownload          bool                     `json:"sequentialDownload"`
	Files                       []PlayerTransmissionFile `json:"files"`
	UpdatedAt                   time.Time                `json:"updatedAt"`
}

type PlayerFileRange struct {
	StartRatio float64 `json:"startRatio"`
	EndRatio   float64 `json:"endRatio"`
}

type PlayerTransmissionFile struct {
	Index          int    `json:"index"`
	Name           string `json:"name"`
	Length         int64  `json:"length"`
	BytesCompleted int64  `json:"bytesCompleted"`
	Wanted         bool   `json:"wanted"`
	Priority       int    `json:"priority"`
	IsVideo        bool   `json:"isVideo"`
}

type PlayerTransmissionResolveStreamInput struct {
	InfoHash         string  `json:"infoHash"`
	FileIndex        int     `json:"fileIndex"`
	RangeHeader      string  `json:"rangeHeader"`
	PreferTranscode  bool    `json:"preferTranscode"`
	AudioTrackIndex  int     `json:"audioTrackIndex"`
	OutputResolution int     `json:"outputResolution"`
	StartSeconds     float64 `json:"startSeconds"`
	StartBytes       int64   `json:"startBytes"`
}

type PlayerTransmissionResolveStreamResult struct {
	FilePath         string                        `json:"filePath"`
	ContentType      string                        `json:"contentType"`
	RangeStart       int64                         `json:"rangeStart"`
	RangeEnd         int64                         `json:"rangeEnd"`
	TotalLength      int64                         `json:"totalLength"`
	Partial          bool                          `json:"partial"`
	Transcode        PlayerFFmpegTranscodeSettings `json:"transcode"`
	AudioTrackIndex  int                           `json:"audioTrackIndex"`
	OutputResolution int                           `json:"outputResolution"`
	StartSeconds     float64                       `json:"startSeconds"`
	StartBytes       int64                         `json:"startBytes"`
}

type CoverResult struct {
	FilePath string `json:"filePath"`
	Pending  bool   `json:"pending"`
}

type GenerateCoverInput struct {
	MediaID    string `json:"mediaId"`
	Kind       string `json:"kind"`
	Size       string `json:"size"`
	SourcePath string `json:"sourcePath"`
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

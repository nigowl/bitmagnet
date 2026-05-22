package adminsettings

type Settings struct {
	LogLevel             string              `json:"logLevel"`
	TMDBEnabled          bool                `json:"tmdbEnabled"`
	IMDbEnabled          bool                `json:"imdbEnabled"`
	DoubanEnabled        bool                `json:"doubanEnabled"`
	DoubanMinScore       float64             `json:"doubanMinScore"`
	DoubanCookie         string              `json:"doubanCookie"`
	DoubanUserAgent      string              `json:"doubanUserAgent"`
	DoubanAcceptLanguage string              `json:"doubanAcceptLanguage"`
	DoubanReferer        string              `json:"doubanReferer"`
	Performance          PerformanceSettings `json:"performance"`
	Home                 HomeSettings        `json:"home"`
	Player               PlayerSettings      `json:"player"`
	Auth                 AuthSettings        `json:"auth"`
}

type PerformanceSettings struct {
	DHT   DHTPerformanceSettings   `json:"dht"`
	Queue QueuePerformanceSettings `json:"queue"`
	Media MediaPerformanceSettings `json:"media"`
}

type DHTPerformanceSettings struct {
	ScalingFactor                 uint  `json:"scalingFactor"`
	ReseedIntervalSeconds         int   `json:"reseedIntervalSeconds"`
	SaveFilesThreshold            uint  `json:"saveFilesThreshold"`
	SavePieces                    bool  `json:"savePieces"`
	RescrapeThresholdHours        int   `json:"rescrapeThresholdHours"`
	StatusLogIntervalSeconds      int   `json:"statusLogIntervalSeconds"`
	GetOldestNodesIntervalSeconds int   `json:"getOldestNodesIntervalSeconds"`
	OldPeerThresholdMinutes       int   `json:"oldPeerThresholdMinutes"`
	ScheduleEnabled               bool  `json:"scheduleEnabled"`
	ScheduleWeekdays              []int `json:"scheduleWeekdays"`
	ScheduleStartHour             int   `json:"scheduleStartHour"`
	ScheduleEndHour               int   `json:"scheduleEndHour"`
}

type QueuePerformanceSettings struct {
	ProcessTorrentConcurrency                int `json:"processTorrentConcurrency"`
	ProcessTorrentCheckIntervalSeconds       int `json:"processTorrentCheckIntervalSeconds"`
	ProcessTorrentTimeoutSeconds             int `json:"processTorrentTimeoutSeconds"`
	ProcessTorrentBatchConcurrency           int `json:"processTorrentBatchConcurrency"`
	ProcessTorrentBatchCheckIntervalSeconds  int `json:"processTorrentBatchCheckIntervalSeconds"`
	ProcessTorrentBatchTimeoutSeconds        int `json:"processTorrentBatchTimeoutSeconds"`
	RefreshMediaMetadataConcurrency          int `json:"refreshMediaMetadataConcurrency"`
	RefreshMediaMetadataCheckIntervalSeconds int `json:"refreshMediaMetadataCheckIntervalSeconds"`
	RefreshMediaMetadataTimeoutSeconds       int `json:"refreshMediaMetadataTimeoutSeconds"`
	BackfillCoverCacheConcurrency            int `json:"backfillCoverCacheConcurrency"`
	BackfillCoverCacheCheckIntervalSeconds   int `json:"backfillCoverCacheCheckIntervalSeconds"`
	BackfillCoverCacheTimeoutSeconds         int `json:"backfillCoverCacheTimeoutSeconds"`
	CleanupCompletedMaxRecords               int `json:"cleanupCompletedMaxRecords"`
	CleanupCompletedMaxAgeDays               int `json:"cleanupCompletedMaxAgeDays"`
}

type MediaPerformanceSettings struct {
	AutoCacheCover       bool `json:"autoCacheCover"`
	AutoFetchBilingual   bool `json:"autoFetchBilingual"`
	WarmupTimeoutSeconds int  `json:"warmupTimeoutSeconds"`
}

type HomeSettings struct {
	Daily     HomeDailySettings     `json:"daily"`
	Hot       HomeHotSettings       `json:"hot"`
	HighScore HomeHighScoreSettings `json:"highScore"`
}

type HomeDailySettings struct {
	RefreshHour int `json:"refreshHour"`
	PoolLimit   int `json:"poolLimit"`
}

type HomeHotSettings struct {
	Days int `json:"days"`
}

type HomeHighScoreSettings struct {
	PoolLimit int     `json:"poolLimit"`
	MinScore  float64 `json:"minScore"`
	MaxScore  float64 `json:"maxScore"`
	Window    float64 `json:"window"`
}

type PlayerSettings struct {
	Enabled                bool                 `json:"enabled"`
	MetadataTimeoutSeconds int                  `json:"metadataTimeoutSeconds"`
	HardTimeoutSeconds     int                  `json:"hardTimeoutSeconds"`
	Transmission           TransmissionSettings `json:"transmission"`
	FFmpeg                 FFmpegSettings       `json:"ffmpeg"`
}

type TransmissionSettings struct {
	Enabled                      bool     `json:"enabled"`
	URL                          string   `json:"url"`
	LocalDownloadDir             string   `json:"localDownloadDir"`
	DownloadMappingDirectory     string   `json:"downloadMappingDirectory"`
	DownloadVideoFormats         []string `json:"downloadVideoFormats"`
	Username                     string   `json:"username"`
	Password                     string   `json:"password"`
	InsecureTLS                  bool     `json:"insecureTls"`
	TimeoutSeconds               int      `json:"timeoutSeconds"`
	SequentialDownload           bool     `json:"sequentialDownload"`
	AutoCleanupEnabled           bool     `json:"autoCleanupEnabled"`
	AutoCleanupSlowTaskEnabled   bool     `json:"autoCleanupSlowTaskEnabled"`
	AutoCleanupStorageEnabled    bool     `json:"autoCleanupStorageEnabled"`
	AutoCleanupMaxTasks          int      `json:"autoCleanupMaxTasks"`
	AutoCleanupMaxTotalSizeGB    int      `json:"autoCleanupMaxTotalSizeGB"`
	AutoCleanupMinFreeSpaceGB    int      `json:"autoCleanupMinFreeSpaceGB"`
	AutoCleanupSlowWindowMinutes int      `json:"autoCleanupSlowWindowMinutes"`
	AutoCleanupSlowRateKbps      int      `json:"autoCleanupSlowRateKbps"`
}

type FFmpegSettings struct {
	Enabled          bool   `json:"enabled"`
	BinaryPath       string `json:"binaryPath"`
	Preset           string `json:"preset"`
	CRF              int    `json:"crf"`
	AudioBitrateKbps int    `json:"audioBitrateKbps"`
	Threads          int    `json:"threads"`
	ExtraArgs        string `json:"extraArgs"`
}

type AuthSettings struct {
	MembershipEnabled   bool `json:"membershipEnabled"`
	RegistrationEnabled bool `json:"registrationEnabled"`
	InviteRequired      bool `json:"inviteRequired"`
}

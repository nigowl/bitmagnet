package adminsettings

type TransmissionTask struct {
	ID             int64   `json:"id"`
	HashString     string  `json:"hashString"`
	Name           string  `json:"name"`
	Status         int     `json:"status"`
	PercentDone    float64 `json:"percentDone"`
	RateDownload   int64   `json:"rateDownload"`
	RateUpload     int64   `json:"rateUpload"`
	LeftUntilDone  int64   `json:"leftUntilDone"`
	SizeWhenDone   int64   `json:"sizeWhenDone"`
	AddedAtUnix    int64   `json:"addedAtUnix"`
	ActivityAtUnix int64   `json:"activityAtUnix"`
	IsFinished     bool    `json:"isFinished"`
	DownloadDir    string  `json:"downloadDir"`
	ErrorString    string  `json:"errorString"`
}

type TransmissionTaskDeleteInput struct {
	ID int64 `json:"id"`
}

type TransmissionTaskDeleteResult struct {
	Success bool  `json:"success"`
	ID      int64 `json:"id"`
}

type TransmissionCleanupResult struct {
	Success           bool     `json:"success"`
	TotalBefore       int      `json:"totalBefore"`
	RemovedCount      int      `json:"removedCount"`
	RemovedIDs        []int64  `json:"removedIds"`
	Reasons           []string `json:"reasons"`
	EstimatedFreeGain int64    `json:"estimatedFreeGain"`
}

type TransmissionTaskStats struct {
	TaskCount          int   `json:"taskCount"`
	TotalSizeBytes     int64 `json:"totalSizeBytes"`
	FreeSpaceBytes     int64 `json:"freeSpaceBytes"`
	FreeSpaceAvailable bool  `json:"freeSpaceAvailable"`
}

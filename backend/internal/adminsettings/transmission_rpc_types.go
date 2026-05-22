package adminsettings

type transmissionTorrentRequest struct {
	Method    string                         `json:"method"`
	Arguments transmissionTorrentRequestArgs `json:"arguments,omitempty"`
}

type transmissionTorrentRequestArgs struct {
	Fields          []string `json:"fields,omitempty"`
	IDs             []int64  `json:"ids,omitempty"`
	DeleteLocalData *bool    `json:"delete-local-data,omitempty"`
}

type transmissionTorrentResponse struct {
	Result    string                             `json:"result"`
	Arguments transmissionTorrentResponsePayload `json:"arguments"`
}

type transmissionTorrentResponsePayload struct {
	Torrents []transmissionTorrentItem `json:"torrents"`
}

type transmissionTorrentItem struct {
	ID            int64   `json:"id"`
	HashString    string  `json:"hashString"`
	Name          string  `json:"name"`
	Status        int     `json:"status"`
	Error         int     `json:"error"`
	PercentDone   float64 `json:"percentDone"`
	RateDownload  int64   `json:"rateDownload"`
	RateUpload    int64   `json:"rateUpload"`
	LeftUntilDone int64   `json:"leftUntilDone"`
	SizeWhenDone  int64   `json:"sizeWhenDone"`
	AddedDate     int64   `json:"addedDate"`
	ActivityDate  int64   `json:"activityDate"`
	IsFinished    bool    `json:"isFinished"`
	DownloadDir   string  `json:"downloadDir"`
	ErrorString   string  `json:"errorString"`
}

type transmissionSessionResponse struct {
	Result    string                             `json:"result"`
	Arguments transmissionSessionResponsePayload `json:"arguments"`
}

type transmissionSessionResponsePayload struct {
	DownloadDirFreeSpace int64 `json:"download-dir-free-space"`
}

package media

type playerTransmissionRPCRequest struct {
	Method    string                         `json:"method"`
	Arguments playerTransmissionRPCArguments `json:"arguments,omitempty"`
}

type playerTransmissionRPCArguments struct {
	IDs             []any    `json:"ids,omitempty"`
	Fields          []string `json:"fields,omitempty"`
	Filename        string   `json:"filename,omitempty"`
	Paused          *bool    `json:"paused,omitempty"`
	FilesWanted     []int    `json:"files-wanted,omitempty"`
	FilesUnwanted   []int    `json:"files-unwanted,omitempty"`
	PriorityHigh    []int    `json:"priority-high,omitempty"`
	PriorityLow     []int    `json:"priority-low,omitempty"`
	PriorityNormal  []int    `json:"priority-normal,omitempty"`
	Sequential      *bool    `json:"sequential_download,omitempty"`
	SequentialFrom  *int     `json:"sequential_download_from_piece,omitempty"`
	DeleteLocalData *bool    `json:"delete-local-data,omitempty"`
}

type playerTransmissionRPCResponse struct {
	Result    string                            `json:"result"`
	Arguments playerTransmissionRPCResponseArgs `json:"arguments"`
}

type playerTransmissionRPCResponseArgs struct {
	Torrents         []playerTransmissionRPCTorrent `json:"torrents"`
	TorrentAdded     *playerTransmissionRPCAddItem  `json:"torrent-added"`
	TorrentDuplicate *playerTransmissionRPCAddItem  `json:"torrent-duplicate"`
}

type playerTransmissionRPCAddItem struct {
	ID         int64  `json:"id"`
	HashString string `json:"hashString"`
	Name       string `json:"name"`
}

type playerTransmissionRPCTorrent struct {
	ID             int64                           `json:"id"`
	HashString     string                          `json:"hashString"`
	Name           string                          `json:"name"`
	Status         int                             `json:"status"`
	PercentDone    float64                         `json:"percentDone"`
	RateDownload   int64                           `json:"rateDownload"`
	RateUpload     int64                           `json:"rateUpload"`
	PeersConnected int                             `json:"peersConnected"`
	Error          int                             `json:"error"`
	ErrorString    string                          `json:"errorString"`
	LeftUntilDone  int64                           `json:"leftUntilDone"`
	SizeWhenDone   int64                           `json:"sizeWhenDone"`
	AddedDate      int64                           `json:"addedDate"`
	ActivityDate   int64                           `json:"activityDate"`
	IsFinished     bool                            `json:"isFinished"`
	DownloadDir    string                          `json:"downloadDir"`
	PieceSize      int64                           `json:"pieceSize"`
	Pieces         string                          `json:"pieces"`
	Files          []playerTransmissionRPCFile     `json:"files"`
	FileStats      []playerTransmissionRPCFileStat `json:"fileStats"`
	Sequential     bool                            `json:"sequential_download"`
}

type playerTransmissionRPCSessionResponse struct {
	Result    string                                   `json:"result"`
	Arguments playerTransmissionRPCSessionResponseArgs `json:"arguments"`
}

type playerTransmissionRPCSessionResponseArgs struct {
	DownloadDirFreeSpace int64  `json:"download-dir-free-space"`
	DownloadDir          string `json:"download-dir"`
	IncompleteDir        string `json:"incomplete-dir"`
	IncompleteDirEnabled bool   `json:"incomplete-dir-enabled"`
}

type playerTransmissionRPCFile struct {
	Name   string `json:"name"`
	Length int64  `json:"length"`
}

type playerTransmissionRPCFileStat struct {
	BytesCompleted int64 `json:"bytesCompleted"`
	Wanted         bool  `json:"wanted"`
	Priority       int   `json:"priority"`
}

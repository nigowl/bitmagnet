package media

import (
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"
)

func boolPtr(value bool) *bool {
	v := value
	return &v
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func minInt64(left int64, right int64) int64 {
	if left < right {
		return left
	}
	return right
}

func playerTransmissionTorrentSizeHint(item playerTransmissionRPCTorrent) int64 {
	return maxInt64(item.SizeWhenDone, item.LeftUntilDone)
}

func playerTransmissionBuildStreamURL(infoHash string, fileIndex int) string {
	query := url.Values{}
	query.Set("infoHash", infoHash)
	query.Set("fileIndex", strconv.Itoa(fileIndex))
	return "/api/media/player/transmission/stream?" + query.Encode()
}

func playerTransmissionDefaultFileIndex(files []playerTransmissionRPCFile, allowedVideoExtensions []string) int {
	if len(files) == 0 {
		return -1
	}
	for idx, file := range files {
		if playerTransmissionIsVideoFile(file.Name, allowedVideoExtensions) {
			return idx
		}
	}
	return 0
}

func playerTransmissionIsVideoFile(name string, allowedVideoExtensions []string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	for _, ext := range playerTransmissionAllowedVideoExtensions(allowedVideoExtensions) {
		if strings.HasSuffix(normalized, ext) {
			return true
		}
	}
	return false
}

func playerTransmissionAllowedVideoExtensions(configured []string) []string {
	if len(configured) == 0 {
		return playerVideoExtensions
	}
	return configured
}

func playerTransmissionStatusLabel(value int) string {
	switch value {
	case 0:
		return "stopped"
	case 1:
		return "check_wait"
	case 2:
		return "checking"
	case 3:
		return "download_wait"
	case 4:
		return "downloading"
	case 5:
		return "seed_wait"
	case 6:
		return "seeding"
	default:
		return fmt.Sprintf("unknown_%d", value)
	}
}

func clampRatio(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

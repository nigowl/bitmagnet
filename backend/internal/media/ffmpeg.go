package media

import "strings"

const (
	PlayerFFmpegHardwareAccelerationNone  = "none"
	PlayerFFmpegHardwareAccelerationVAAPI = "vaapi"
	PlayerFFmpegVAAPIDevice               = "/dev/dri/renderD128"
)

func NormalizePlayerFFmpegHardwareAcceleration(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case PlayerFFmpegHardwareAccelerationVAAPI:
		return PlayerFFmpegHardwareAccelerationVAAPI
	default:
		return PlayerFFmpegHardwareAccelerationNone
	}
}

func IsPlayerFFmpegHardwareAcceleration(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case PlayerFFmpegHardwareAccelerationNone, PlayerFFmpegHardwareAccelerationVAAPI:
		return true
	default:
		return false
	}
}

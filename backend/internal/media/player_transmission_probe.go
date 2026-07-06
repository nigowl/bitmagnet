package media

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type playerFFprobeStream struct {
	Index          int               `json:"index"`
	CodecType      string            `json:"codec_type"`
	CodecName      string            `json:"codec_name"`
	Duration       string            `json:"duration"`
	PixelFormat    string            `json:"pix_fmt"`
	ColorSpace     string            `json:"color_space"`
	ColorTransfer  string            `json:"color_transfer"`
	ColorPrimaries string            `json:"color_primaries"`
	ColorRange     string            `json:"color_range"`
	Channels       int               `json:"channels"`
	Tags           map[string]string `json:"tags"`
	Disposition    struct {
		Default int `json:"default"`
	} `json:"disposition"`
}

type playerFFprobeFormat struct {
	Duration string `json:"duration"`
}

type playerFFprobeResult struct {
	Streams []playerFFprobeStream `json:"streams"`
	Format  playerFFprobeFormat   `json:"format"`
}

func playerTransmissionProbeDuration(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
) (float64, error) {
	ffprobePath := playerTransmissionResolveFFprobePath(ffmpegBinaryPath)
	cmd := exec.CommandContext(
		ctx,
		ffprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_entries", "format=duration:stream=duration",
		"-select_streams", "v:0",
		filePath,
	)
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	var payload playerFFprobeResult
	if err := json.Unmarshal(output, &payload); err != nil {
		return 0, err
	}
	candidates := []string{payload.Format.Duration}
	for _, stream := range payload.Streams {
		candidates = append(candidates, stream.Duration)
	}
	for _, candidate := range candidates {
		duration, parseErr := strconv.ParseFloat(strings.TrimSpace(candidate), 64)
		if parseErr == nil && duration > 0 && !math.IsNaN(duration) && !math.IsInf(duration, 0) {
			return duration, nil
		}
	}
	return 0, fmt.Errorf("ffprobe duration unavailable")
}

func playerTransmissionProbeAudioTracks(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
) ([]PlayerTransmissionAudioTrack, error) {
	ffprobePath := playerTransmissionResolveFFprobePath(ffmpegBinaryPath)
	cmd := exec.CommandContext(
		ctx,
		ffprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_streams",
		"-select_streams", "a",
		filePath,
	)
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var payload playerFFprobeResult
	if err := json.Unmarshal(output, &payload); err != nil {
		return nil, err
	}
	result := make([]PlayerTransmissionAudioTrack, 0, len(payload.Streams))
	for idx, stream := range payload.Streams {
		if !strings.EqualFold(strings.TrimSpace(stream.CodecType), "audio") {
			continue
		}
		label := strings.TrimSpace(stream.Tags["title"])
		if label == "" {
			label = fmt.Sprintf("Track %d", idx+1)
		}
		result = append(result, PlayerTransmissionAudioTrack{
			Index:       idx,
			StreamIndex: stream.Index,
			Label:       label,
			Language:    strings.TrimSpace(stream.Tags["language"]),
			Codec:       strings.TrimSpace(stream.CodecName),
			Channels:    stream.Channels,
			Default:     stream.Disposition.Default > 0,
		})
	}
	return result, nil
}

func playerTransmissionProbeVideoColorInfo(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
) (PlayerVideoColorInfo, error) {
	ffprobePath := playerTransmissionResolveFFprobePath(ffmpegBinaryPath)
	cmd := exec.CommandContext(
		ctx,
		ffprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_entries", "stream=pix_fmt,color_space,color_transfer,color_primaries,color_range",
		"-select_streams", "v:0",
		filePath,
	)
	output, err := cmd.Output()
	if err != nil {
		return PlayerVideoColorInfo{}, err
	}
	var payload playerFFprobeResult
	if err := json.Unmarshal(output, &payload); err != nil {
		return PlayerVideoColorInfo{}, err
	}
	if len(payload.Streams) == 0 {
		return PlayerVideoColorInfo{}, fmt.Errorf("ffprobe video color unavailable")
	}
	stream := payload.Streams[0]
	info := PlayerVideoColorInfo{
		PixelFormat:    strings.TrimSpace(stream.PixelFormat),
		ColorSpace:     strings.TrimSpace(stream.ColorSpace),
		ColorTransfer:  strings.TrimSpace(stream.ColorTransfer),
		ColorPrimaries: strings.TrimSpace(stream.ColorPrimaries),
		ColorRange:     strings.TrimSpace(stream.ColorRange),
	}
	info.NeedsToneMap = playerVideoColorNeedsToneMap(info)
	return info, nil
}

func playerVideoColorNeedsToneMap(info PlayerVideoColorInfo) bool {
	transfer := strings.ToLower(strings.TrimSpace(info.ColorTransfer))
	primaries := strings.ToLower(strings.TrimSpace(info.ColorPrimaries))
	space := strings.ToLower(strings.TrimSpace(info.ColorSpace))
	return strings.Contains(transfer, "smpte2084") ||
		strings.Contains(transfer, "arib-std-b67") ||
		strings.Contains(transfer, "bt2020") ||
		strings.Contains(primaries, "bt2020") ||
		strings.Contains(space, "bt2020")
}

func playerTransmissionResolveFFprobePath(ffmpegBinaryPath string) string {
	ffmpegPath := strings.TrimSpace(ffmpegBinaryPath)
	if ffmpegPath == "" {
		return "ffprobe"
	}
	lowerName := strings.ToLower(filepath.Base(ffmpegPath))
	if strings.HasPrefix(lowerName, "ffmpeg") {
		return filepath.Join(filepath.Dir(ffmpegPath), "ffprobe")
	}
	return "ffprobe"
}

package adminsettings

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type FFmpegTestInput struct {
	BinaryPath       string `json:"binaryPath"`
	Preset           string `json:"preset"`
	CRF              int    `json:"crf"`
	AudioBitrateKbps int    `json:"audioBitrateKbps"`
	Threads          int    `json:"threads"`
	ExtraArgs        string `json:"extraArgs"`
}

type FFmpegTestResult struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	BinaryPath  string `json:"binaryPath"`
	LatencyMs   int64  `json:"latencyMs"`
	Version     string `json:"version"`
	ArgsPreview string `json:"argsPreview"`
	EncodeMode  string `json:"encodeMode"`
}

func (s *service) TestPlayerFFmpeg(ctx context.Context, input FFmpegTestInput) (FFmpegTestResult, error) {
	binaryPath := strings.TrimSpace(input.BinaryPath)
	if binaryPath == "" {
		binaryPath = strings.TrimSpace(s.defaults.Player.FFmpeg.BinaryPath)
	}
	if binaryPath == "" {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.binaryPath", ErrInvalidInput)
	}

	preset := strings.TrimSpace(input.Preset)
	if preset == "" {
		preset = strings.TrimSpace(s.defaults.Player.FFmpeg.Preset)
	}
	if preset == "" {
		preset = "veryfast"
	}

	crf := input.CRF
	if crf == 0 {
		crf = s.defaults.Player.FFmpeg.CRF
	}
	if crf < 16 || crf > 38 {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.crf", ErrInvalidInput)
	}

	audioBitrate := input.AudioBitrateKbps
	if audioBitrate == 0 {
		audioBitrate = s.defaults.Player.FFmpeg.AudioBitrateKbps
	}
	if audioBitrate < 64 || audioBitrate > 320 {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.audioBitrateKbps", ErrInvalidInput)
	}

	threads := input.Threads
	if threads < 0 || threads > 32 {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.threads", ErrInvalidInput)
	}

	options := FFmpegSettings{
		Enabled:          true,
		BinaryPath:       binaryPath,
		Preset:           preset,
		CRF:              crf,
		AudioBitrateKbps: audioBitrate,
		Threads:          threads,
		ExtraArgs:        strings.TrimSpace(input.ExtraArgs),
	}
	testArgs := buildFFmpegSanityArgs(options)
	preview := strings.Join(append([]string{binaryPath}, testArgs...), " ")

	startedAt := time.Now()
	version, err := probeFFmpegVersion(ctx, binaryPath)
	if err != nil {
		return FFmpegTestResult{
			Success:     false,
			Message:     err.Error(),
			BinaryPath:  binaryPath,
			LatencyMs:   time.Since(startedAt).Milliseconds(),
			ArgsPreview: preview,
			EncodeMode:  "lavfi-smoke",
		}, nil
	}

	if err := probeFFmpegEncode(ctx, binaryPath, testArgs); err != nil {
		return FFmpegTestResult{
			Success:     false,
			Message:     err.Error(),
			BinaryPath:  binaryPath,
			LatencyMs:   time.Since(startedAt).Milliseconds(),
			Version:     version,
			ArgsPreview: preview,
			EncodeMode:  "lavfi-smoke",
		}, nil
	}

	return FFmpegTestResult{
		Success:     true,
		Message:     "ffmpeg encode pipeline ok",
		BinaryPath:  binaryPath,
		LatencyMs:   time.Since(startedAt).Milliseconds(),
		Version:     version,
		ArgsPreview: preview,
		EncodeMode:  "lavfi-smoke",
	}, nil
}

func probeFFmpegVersion(ctx context.Context, binaryPath string) (string, error) {
	cmd := exec.CommandContext(ctx, binaryPath, "-version")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("ffmpeg version failed: %s", message)
	}

	firstLine := ""
	for _, line := range strings.Split(stdout.String(), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			firstLine = trimmed
			break
		}
	}
	if firstLine == "" {
		return "unknown", nil
	}
	return firstLine, nil
}

func probeFFmpegEncode(ctx context.Context, binaryPath string, args []string) error {
	testCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(testCtx, binaryPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("ffmpeg encode failed: %s", message)
	}
	return nil
}

func buildFFmpegSanityArgs(options FFmpegSettings) []string {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-f", "lavfi",
		"-i", "testsrc=size=160x90:rate=24",
		"-f", "lavfi",
		"-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
		"-t", "1.2",
		"-map", "0:v:0",
		"-map", "1:a:0",
		"-sn",
		"-dn",
		"-c:v", "libx264",
		"-preset", options.Preset,
		"-crf", strconv.Itoa(options.CRF),
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", fmt.Sprintf("%dk", options.AudioBitrateKbps),
	}
	if options.Threads > 0 {
		args = append(args, "-threads", strconv.Itoa(options.Threads))
	}
	if extra := strings.TrimSpace(options.ExtraArgs); extra != "" {
		args = append(args, strings.Fields(extra)...)
	}
	args = append(args, "-f", "null", "-")
	return args
}

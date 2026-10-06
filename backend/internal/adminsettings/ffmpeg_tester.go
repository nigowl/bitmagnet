package adminsettings

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/media/ffmpegargs"
)

const (
	ffmpegTestOutputResolution = 2160
	ffmpegTestDurationSeconds  = "6.2"
	ffmpegTestStartSeconds     = 1.2
)

type FFmpegTestInput struct {
	BinaryPath           string `json:"binaryPath"`
	Preset               string `json:"preset"`
	CRF                  int    `json:"crf"`
	AudioBitrateKbps     int    `json:"audioBitrateKbps"`
	Threads              int    `json:"threads"`
	HardwareAcceleration string `json:"hardwareAcceleration"`
	ExtraArgs            string `json:"extraArgs"`
}

type FFmpegTestResult struct {
	Success              bool   `json:"success"`
	Message              string `json:"message"`
	BinaryPath           string `json:"binaryPath"`
	LatencyMs            int64  `json:"latencyMs"`
	Version              string `json:"version"`
	ArgsPreview          string `json:"argsPreview"`
	EncodeMode           string `json:"encodeMode"`
	HardwareAcceleration string `json:"hardwareAcceleration"`
}

func (s *service) TestPlayerFFmpeg(ctx context.Context, input FFmpegTestInput) (FFmpegTestResult, error) {
	binaryPath := firstNonEmptyTrimmed(input.BinaryPath, s.defaults.Player.FFmpeg.BinaryPath)
	if binaryPath == "" {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.binaryPath", ErrInvalidInput)
	}

	preset := firstNonEmptyTrimmed(input.Preset, s.defaults.Player.FFmpeg.Preset)
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

	hardwareAcceleration := firstNonEmptyTrimmed(input.HardwareAcceleration, s.defaults.Player.FFmpeg.HardwareAcceleration)
	if hardwareAcceleration == "" {
		hardwareAcceleration = media.PlayerFFmpegHardwareAccelerationNone
	}
	hardwareAcceleration = media.NormalizePlayerFFmpegHardwareAcceleration(hardwareAcceleration)
	if !media.IsPlayerFFmpegHardwareAcceleration(input.HardwareAcceleration) && strings.TrimSpace(input.HardwareAcceleration) != "" {
		return FFmpegTestResult{}, fmt.Errorf("%w: player.ffmpeg.hardwareAcceleration", ErrInvalidInput)
	}

	options := FFmpegSettings{
		Enabled:              true,
		BinaryPath:           binaryPath,
		Preset:               preset,
		CRF:                  crf,
		AudioBitrateKbps:     audioBitrate,
		Threads:              threads,
		HardwareAcceleration: hardwareAcceleration,
		ExtraArgs:            firstNonEmptyTrimmed(input.ExtraArgs),
	}

	startedAt := time.Now()
	encodeMode := "hls-smoke"
	if hardwareAcceleration != media.PlayerFFmpegHardwareAccelerationNone {
		encodeMode = "hls-" + hardwareAcceleration
	}
	buildResult := func(success bool, message string, version string, args []string) FFmpegTestResult {
		return FFmpegTestResult{
			Success:              success,
			Message:              message,
			BinaryPath:           binaryPath,
			LatencyMs:            time.Since(startedAt).Milliseconds(),
			Version:              version,
			ArgsPreview:          strings.Join(append([]string{binaryPath}, args...), " "),
			EncodeMode:           encodeMode,
			HardwareAcceleration: hardwareAcceleration,
		}
	}

	version, err := probeFFmpegVersion(ctx, binaryPath)
	if err != nil {
		return buildResult(false, err.Error(), "", nil), nil
	}

	testArgs, err := probeFFmpegHLS(ctx, binaryPath, options)
	if err != nil {
		return buildResult(false, err.Error(), version, testArgs), nil
	}

	return buildResult(true, "ffmpeg hls encode pipeline ok", version, testArgs), nil
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

func probeFFmpegHLS(ctx context.Context, binaryPath string, options FFmpegSettings) ([]string, error) {
	testCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	workDir, err := os.MkdirTemp("", "bitmagnet-ffmpeg-hls-test-*")
	if err != nil {
		return nil, fmt.Errorf("create ffmpeg test directory: %w", err)
	}
	defer os.RemoveAll(workDir)

	inputPath := filepath.Join(workDir, "input.mkv")
	outputDir := filepath.Join(workDir, "hls")
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create ffmpeg hls output directory: %w", err)
	}

	if err := runFFmpegCommand(testCtx, binaryPath, buildFFmpegTestInputArgs(inputPath, options)); err != nil {
		return nil, fmt.Errorf("ffmpeg test input generation failed: %w", err)
	}

	testArgs := buildFFmpegHLSArgs(inputPath, outputDir, options)
	if err := runFFmpegCommand(testCtx, binaryPath, testArgs); err != nil {
		return testArgs, fmt.Errorf("ffmpeg hls encode failed: %w", err)
	}

	playlistPath := filepath.Join(outputDir, "index.m3u8")
	playlist, err := os.ReadFile(playlistPath)
	if err != nil {
		return testArgs, fmt.Errorf("ffmpeg hls playlist missing: %w", err)
	}
	playlistText := string(playlist)
	if !strings.Contains(playlistText, "#EXTM3U") || !strings.Contains(playlistText, "#EXTINF:") {
		return testArgs, fmt.Errorf("ffmpeg hls playlist is invalid")
	}

	segments, err := filepath.Glob(filepath.Join(outputDir, "segment-*.ts"))
	if err != nil {
		return testArgs, fmt.Errorf("ffmpeg hls segment scan failed: %w", err)
	}
	if len(segments) < 2 {
		return testArgs, fmt.Errorf("ffmpeg hls produced fewer than two segments")
	}
	decodeArgs := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-i", playlistPath,
		"-t", "2",
		"-map", "0:v:0",
		"-map", "0:a?",
		"-sn",
		"-dn",
		"-f", "null",
		"-",
	}
	if err := runFFmpegCommand(testCtx, binaryPath, decodeArgs); err != nil {
		return testArgs, fmt.Errorf("ffmpeg hls playback probe failed: %w", err)
	}
	return testArgs, nil
}

func buildFFmpegTestInputArgs(inputPath string, options FFmpegSettings) []string {
	sourceSize := "1280x720"
	videoCodec := "libx264"
	pixelFormat := "yuv420p"
	colorArgs := []string(nil)
	if options.HardwareAcceleration == media.PlayerFFmpegHardwareAccelerationVAAPI {
		sourceSize = "3840x2160"
		videoCodec = "libx265"
		pixelFormat = "yuv420p10le"
		colorArgs = []string{
			"-color_primaries", "bt2020",
			"-color_trc", "smpte2084",
			"-colorspace", "bt2020nc",
			"-color_range", "tv",
		}
	}
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-y",
		"-f", "lavfi",
		"-i", "testsrc=size=" + sourceSize + ":rate=24",
		"-f", "lavfi",
		"-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
		"-t", ffmpegTestDurationSeconds,
		"-map", "0:v:0",
		"-map", "1:a:0",
		"-c:v", videoCodec,
		"-preset", "ultrafast",
		"-pix_fmt", pixelFormat,
		"-c:a", "aac",
		"-b:a", "128k",
	}
	args = append(args, colorArgs...)
	return append(args, inputPath)
}

func buildFFmpegHLSArgs(inputPath string, outputDir string, options FFmpegSettings) []string {
	return ffmpegargs.BuildPlayerHLSFFmpegArgs(
		inputPath,
		media.PlayerFFmpegTranscodeSettings{
			Enabled:              true,
			BinaryPath:           options.BinaryPath,
			Preset:               options.Preset,
			CRF:                  options.CRF,
			AudioBitrateKbps:     options.AudioBitrateKbps,
			Threads:              options.Threads,
			HardwareAcceleration: options.HardwareAcceleration,
			ExtraArgs:            options.ExtraArgs,
		},
		ffmpegTestStartSeconds,
		-1,
		ffmpegTestOutputResolution,
		media.PlayerVideoColorInfo{NeedsToneMap: options.HardwareAcceleration == media.PlayerFFmpegHardwareAccelerationVAAPI},
		false,
		2,
		outputDir,
	)
}

func runFFmpegCommand(ctx context.Context, binaryPath string, args []string) error {
	cmd := exec.CommandContext(ctx, binaryPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("%s", message)
	}
	return nil
}

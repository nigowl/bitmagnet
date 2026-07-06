package mediaapi

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/media"
)

func playerFFmpegH264Level(outputResolution int) string {
	if outputResolution <= 0 || outputResolution >= 1440 {
		return "5.1"
	}
	return "4.1"
}

func normalizedPlayerFFmpegOptions(options media.PlayerFFmpegTranscodeSettings) (string, int, int) {
	preset := strings.TrimSpace(options.Preset)
	if preset == "" {
		preset = "veryfast"
	}
	crf := options.CRF
	if crf < 16 || crf > 38 {
		crf = 21
	}
	audioBitrate := options.AudioBitrateKbps
	if audioBitrate < 64 || audioBitrate > 320 {
		audioBitrate = 192
	}
	return preset, crf, audioBitrate
}

func buildPlayerFFmpegArgs(
	filePath string,
	options media.PlayerFFmpegTranscodeSettings,
	startSeconds float64,
	audioTrackIndex int,
	outputResolution int,
	videoColor media.PlayerVideoColorInfo,
	realTimeInput bool,
) []string {
	preset, crf, audioBitrate := normalizedPlayerFFmpegOptions(options)

	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-fflags", "+genpts",
		"-avoid_negative_ts", "make_zero",
	}
	if startSeconds > 0 {
		startValue := strconv.FormatFloat(startSeconds, 'f', 3, 64)
		// For local file input, place -ss before -i for faster seek.
		if filePath != "pipe:0" {
			args = append(args, "-ss", startValue)
		}
	}
	if filePath != "pipe:0" && realTimeInput {
		// Keep ffmpeg from racing ahead into sparse, not-yet-downloaded file ranges.
		args = append(args, "-re")
	}
	args = append(args, "-i", filePath)
	if startSeconds > 0 && filePath == "pipe:0" {
		// pipe input is not seekable; place -ss after -i for decode-side seek.
		args = append(args, "-ss", strconv.FormatFloat(startSeconds, 'f', 3, 64))
	}
	args = append(args,
		"-map", "0:v:0",
		"-map", selectedAudioTrackMap(audioTrackIndex),
		"-sn",
		"-dn",
		"-c:v", "libx264",
		"-preset", preset,
		"-crf", strconv.Itoa(crf),
		"-pix_fmt", "yuv420p",
		"-profile:v", "high",
		"-level", playerFFmpegH264Level(outputResolution),
		"-g", "48",
		"-keyint_min", "48",
		"-sc_threshold", "0",
		"-c:a", "aac",
		"-ac", "2",
		"-ar", "48000",
		"-b:a", fmt.Sprintf("%dk", audioBitrate),
		"-muxpreload", "0",
		"-muxdelay", "0",
		"-max_interleave_delta", "0",
		"-max_muxing_queue_size", "4096",
	)
	if filterChain := playerFFmpegVideoFilterChain(outputResolution, videoColor); filterChain != "" {
		args = append(args, "-vf", filterChain)
	}
	if videoColor.NeedsToneMap {
		args = append(args, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv")
	}
	if options.Threads > 0 {
		args = append(args, "-threads", strconv.Itoa(options.Threads))
	}
	if extra := strings.TrimSpace(options.ExtraArgs); extra != "" {
		args = append(args, strings.Fields(extra)...)
	}
	args = append(args, "-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1")
	return args
}

func buildPlayerHLSFFmpegArgs(
	filePath string,
	options media.PlayerFFmpegTranscodeSettings,
	startSeconds float64,
	audioTrackIndex int,
	outputResolution int,
	videoColor media.PlayerVideoColorInfo,
	_ int,
	outputDir string,
) []string {
	preset, crf, audioBitrate := normalizedPlayerFFmpegOptions(options)

	segmentPattern := filepath.Join(outputDir, "segment-%06d.ts")
	playlistPath := filepath.Join(outputDir, "index.m3u8")
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-fflags", "+genpts",
		"-avoid_negative_ts", "make_zero",
	}
	if startSeconds > 0 {
		startValue := strconv.FormatFloat(startSeconds, 'f', 3, 64)
		if filePath != "pipe:0" {
			args = append(args, "-ss", startValue)
		}
	}
	args = append(args, "-i", filePath)
	if startSeconds > 0 && filePath == "pipe:0" {
		args = append(args, "-ss", strconv.FormatFloat(startSeconds, 'f', 3, 64))
	}
	args = append(args,
		"-map", "0:v:0",
		"-map", selectedAudioTrackMap(audioTrackIndex),
		"-sn",
		"-dn",
		"-c:v", "libx264",
		"-preset", preset,
		"-crf", strconv.Itoa(crf),
		"-pix_fmt", "yuv420p",
		"-profile:v", "high",
		"-level", playerFFmpegH264Level(outputResolution),
		"-g", "48",
		"-keyint_min", "48",
		"-sc_threshold", "0",
		"-force_key_frames", fmt.Sprintf("expr:gte(t,n_forced*%d)", playerHLSSegmentSeconds),
		"-c:a", "aac",
		"-ac", "2",
		"-ar", "48000",
		"-b:a", fmt.Sprintf("%dk", audioBitrate),
		"-muxpreload", "0",
		"-muxdelay", "0",
		"-max_interleave_delta", "0",
		"-max_muxing_queue_size", "4096",
	)
	if filterChain := playerFFmpegVideoFilterChain(outputResolution, videoColor); filterChain != "" {
		args = append(args, "-vf", filterChain)
	}
	if videoColor.NeedsToneMap {
		args = append(args, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv")
	}
	if options.Threads > 0 {
		args = append(args, "-threads", strconv.Itoa(options.Threads))
	}
	if extra := strings.TrimSpace(options.ExtraArgs); extra != "" {
		args = append(args, strings.Fields(extra)...)
	}
	args = append(args,
		"-f", "hls",
		"-hls_time", strconv.Itoa(playerHLSSegmentSeconds),
		"-hls_list_size", "0",
		"-hls_playlist_type", "event",
		"-hls_segment_type", "mpegts",
		"-hls_flags", "independent_segments+temp_file",
		"-hls_segment_filename", segmentPattern,
		playlistPath,
	)
	return args
}

func playerFFmpegVideoFilterChain(outputResolution int, videoColor media.PlayerVideoColorInfo) string {
	filters := make([]string, 0, 3)
	if videoColor.NeedsToneMap {
		filters = append(filters, "tonemap=tonemap=mobius:peak=1000:desat=1.5")
	}
	if outputResolution > 0 {
		filters = append(filters, fmt.Sprintf("scale=w=-2:h=%d:force_original_aspect_ratio=decrease:force_divisible_by=2", outputResolution))
	}
	if videoColor.NeedsToneMap {
		filters = append(filters, "format=yuv420p")
	}
	return strings.Join(filters, ",")
}

func buildPlayerFFmpegThumbnailArgs(filePath string, seconds float64) []string {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
	}
	if seconds > 0 {
		args = append(args, "-ss", strconv.FormatFloat(seconds, 'f', 3, 64))
	}
	args = append(
		args,
		"-i", filePath,
		"-map", "0:v:0",
		"-frames:v", "1",
		"-vf", "scale=w=320:h=-2:force_original_aspect_ratio=decrease",
		"-q:v", "5",
		"-f", "image2pipe",
		"-vcodec", "mjpeg",
		"pipe:1",
	)
	return args
}

func selectedAudioTrackMap(index int) string {
	if index < 0 {
		return "0:a?"
	}
	return fmt.Sprintf("0:a:%d?", index)
}

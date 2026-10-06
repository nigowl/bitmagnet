package mediaapi

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/media/ffmpegargs"
)

func playerFFmpegH264Level(outputResolution int) string {
	if outputResolution <= 0 || outputResolution >= 1440 {
		return "5.1"
	}
	return "4.1"
}

func normalizedPlayerFFmpegOptions(options media.PlayerFFmpegTranscodeSettings) (string, int, int, string) {
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
	return preset, crf, audioBitrate, media.NormalizePlayerFFmpegHardwareAcceleration(options.HardwareAcceleration)
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
	preset, crf, audioBitrate, hardwareAcceleration := normalizedPlayerFFmpegOptions(options)

	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-fflags", "+genpts",
		"-avoid_negative_ts", "make_zero",
	}
	if hardwareAcceleration == media.PlayerFFmpegHardwareAccelerationVAAPI {
		args = append(args, "-vaapi_device", media.PlayerFFmpegVAAPIDevice)
	}
	if startSeconds > 0 {
		startValue := strconv.FormatFloat(startSeconds, 'f', 3, 64)
		if filePath != "pipe:0" {
			args = append(args, "-ss", startValue)
		}
	}
	if filePath != "pipe:0" && realTimeInput {
		args = append(args,
			"-readrate", "4",
			"-readrate_initial_burst", "8",
			"-readrate_catchup", "8",
		)
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
		"-g", "48",
		"-c:a", "aac",
		"-ac", "2",
		"-ar", "48000",
		"-b:a", fmt.Sprintf("%dk", audioBitrate),
		"-muxpreload", "0",
		"-muxdelay", "0",
		"-max_interleave_delta", "0",
		"-max_muxing_queue_size", "4096",
	)
	if hardwareAcceleration == media.PlayerFFmpegHardwareAccelerationVAAPI {
		args = append(args, "-c:v", "h264_vaapi", "-qp", strconv.Itoa(crf))
	} else {
		args = append(args,
			"-profile:v", "high",
			"-level", playerFFmpegH264Level(outputResolution),
			"-keyint_min", "48",
			"-sc_threshold", "0",
			"-c:v", "libx264",
			"-preset", preset,
			"-crf", strconv.Itoa(crf),
			"-pix_fmt", "yuv420p",
		)
	}
	if filterChain := playerFFmpegVideoFilterChain(outputResolution, videoColor, hardwareAcceleration); filterChain != "" {
		args = append(args, "-vf", filterChain)
	}
	if videoColor.NeedsToneMap && hardwareAcceleration != media.PlayerFFmpegHardwareAccelerationVAAPI {
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
	realTimeInput bool,
	outputDir string,
) []string {
	return ffmpegargs.BuildPlayerHLSFFmpegArgs(
		filePath,
		options,
		startSeconds,
		audioTrackIndex,
		outputResolution,
		videoColor,
		realTimeInput,
		playerHLSSegmentSeconds,
		outputDir,
	)
}

func playerFFmpegVideoFilterChain(outputResolution int, videoColor media.PlayerVideoColorInfo, hardwareAcceleration string) string {
	filters := make([]string, 0, 3)
	if hardwareAcceleration == media.PlayerFFmpegHardwareAccelerationVAAPI {
		// The host driver lacks tonemap_vaapi, so keep HDR passthrough for realtime playback.
		return playerFFmpegVAAPIScaleFilter(outputResolution)
	}
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

func playerFFmpegVAAPIScaleFilter(outputResolution int) string {
	targetHeight := "ih"
	if outputResolution > 0 {
		targetHeight = strconv.Itoa(outputResolution)
	}
	return fmt.Sprintf(
		"format=nv12,hwupload,scale_vaapi=w='max(256,ceil(iw*min(1,%s/ih)/2)*2)':h='max(128,ceil(ih*min(1,%s/ih)/2)*2)':format=nv12",
		targetHeight,
		targetHeight,
	)
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

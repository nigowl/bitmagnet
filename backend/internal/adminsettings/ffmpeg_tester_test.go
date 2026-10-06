package adminsettings

import (
	"context"
	"os/exec"
	"strings"
	"testing"

	"github.com/nigowl/bitmagnet/internal/media"
)

func TestBuildFFmpegHLSArgsUsesVAAPIEncoder(t *testing.T) {
	args := buildFFmpegHLSArgs("/tmp/input.mkv", "/tmp/hls", FFmpegSettings{
		Preset:               "veryfast",
		CRF:                  23,
		AudioBitrateKbps:     128,
		HardwareAcceleration: media.PlayerFFmpegHardwareAccelerationVAAPI,
	})
	joined := strings.Join(args, " ")
	for _, expected := range []string{
		"-vaapi_device /dev/dri/renderD128",
		"-f hls",
		"-hls_time 2",
		"-hls_segment_type mpegts",
		"-vf format=nv12,hwupload,scale_vaapi=",
		"format=nv12",
		"-c:v h264_vaapi",
		"-qp 23",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected VAAPI test args to contain %q, args=%s", expected, joined)
		}
	}
	if strings.Contains(joined, "-hwaccel vaapi") {
		t.Fatalf("expected VAAPI test args to leave decoding on the faster CPU path, args=%s", joined)
	}
	if strings.Contains(joined, "-force_key_frames") || strings.Contains(joined, "-profile:v") || strings.Contains(joined, "-level") {
		t.Fatalf("expected VAAPI HLS test args to match the playback-compatible path, args=%s", joined)
	}
}

func TestBuildFFmpegTestInputUsesHDRHEVCForVAAPI(t *testing.T) {
	args := strings.Join(buildFFmpegTestInputArgs("/tmp/input.mkv", FFmpegSettings{
		HardwareAcceleration: media.PlayerFFmpegHardwareAccelerationVAAPI,
	}), " ")
	for _, expected := range []string{
		"testsrc=size=3840x2160:rate=24",
		"-c:v libx265",
		"-pix_fmt yuv420p10le",
		"-color_primaries bt2020",
		"-color_trc smpte2084",
		"-colorspace bt2020nc",
	} {
		if !strings.Contains(args, expected) {
			t.Fatalf("expected VAAPI test input to contain %q, args=%s", expected, args)
		}
	}
}

func TestProbeFFmpegHLSProducesPlaylistAndSegment(t *testing.T) {
	binaryPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}

	_, err = probeFFmpegHLS(context.Background(), binaryPath, FFmpegSettings{
		Preset:           "veryfast",
		CRF:              23,
		AudioBitrateKbps: 128,
	})
	if err != nil {
		t.Fatalf("expected software HLS probe to produce playable output: %v", err)
	}
}

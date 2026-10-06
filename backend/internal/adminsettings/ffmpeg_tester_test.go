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
		"-vf scale=w=-2:h=2160",
		"format=nv12",
		"hwupload",
		"-c:v h264_vaapi",
		"-qp 23",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected VAAPI test args to contain %q, args=%s", expected, joined)
		}
	}
	if strings.Contains(joined, "-force_key_frames") || strings.Contains(joined, "-profile:v") || strings.Contains(joined, "-level") {
		t.Fatalf("expected VAAPI HLS test args to match the playback-compatible path, args=%s", joined)
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

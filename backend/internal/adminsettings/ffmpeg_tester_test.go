package adminsettings

import (
	"strings"
	"testing"

	"github.com/nigowl/bitmagnet/internal/media"
)

func TestBuildFFmpegSanityArgsUsesVAAPIEncoder(t *testing.T) {
	args := buildFFmpegSanityArgs(FFmpegSettings{
		Preset:               "veryfast",
		CRF:                  23,
		AudioBitrateKbps:     128,
		HardwareAcceleration: media.PlayerFFmpegHardwareAccelerationVAAPI,
	})
	joined := strings.Join(args, " ")
	for _, expected := range []string{
		"-vaapi_device /dev/dri/renderD128",
		"testsrc=size=320x240:rate=24",
		"-vf format=nv12,hwupload",
		"-c:v h264_vaapi",
		"-qp 23",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected VAAPI test args to contain %q, args=%s", expected, joined)
		}
	}
}

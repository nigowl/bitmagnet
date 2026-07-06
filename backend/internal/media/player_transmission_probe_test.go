package media

import "testing"

func TestPlayerVideoColorNeedsToneMap(t *testing.T) {
	cases := []struct {
		name string
		info PlayerVideoColorInfo
		want bool
	}{
		{
			name: "pq hdr",
			info: PlayerVideoColorInfo{ColorTransfer: "smpte2084", ColorPrimaries: "bt2020"},
			want: true,
		},
		{
			name: "bt2020 source",
			info: PlayerVideoColorInfo{ColorSpace: "bt2020nc"},
			want: true,
		},
		{
			name: "sdr bt709",
			info: PlayerVideoColorInfo{PixelFormat: "yuv420p", ColorTransfer: "bt709", ColorPrimaries: "bt709", ColorSpace: "bt709"},
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := playerVideoColorNeedsToneMap(tc.info); got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

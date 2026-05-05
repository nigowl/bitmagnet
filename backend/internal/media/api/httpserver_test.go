package mediaapi

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/nigowl/bitmagnet/internal/media"
)

func TestBuildPlayerFFmpegArgsUsesRealtimeInputOnlyForIncompleteFiles(t *testing.T) {
	settings := media.PlayerFFmpegTranscodeSettings{
		Preset:           "veryfast",
		CRF:              23,
		AudioBitrateKbps: 128,
	}

	incompleteArgs := buildPlayerFFmpegArgs("/tmp/video.mkv", settings, 0, -1, 0, true)
	if !containsArg(incompleteArgs, "-re") {
		t.Fatalf("expected incomplete local input to include -re, args=%s", strings.Join(incompleteArgs, " "))
	}

	completedArgs := buildPlayerFFmpegArgs("/tmp/video.mkv", settings, 0, -1, 0, false)
	if containsArg(completedArgs, "-re") {
		t.Fatalf("expected completed local input to skip -re, args=%s", strings.Join(completedArgs, " "))
	}
}

func TestBuildPlayerHLSFFmpegArgsWritesSegmentedPlaylist(t *testing.T) {
	settings := media.PlayerFFmpegTranscodeSettings{
		Preset:           "veryfast",
		CRF:              23,
		AudioBitrateKbps: 128,
	}

	args := buildPlayerHLSFFmpegArgs("/tmp/video.mkv", settings, 12.5, -1, 1080, "/tmp/hls-cache")
	joined := strings.Join(args, " ")
	for _, expected := range []string{
		"-f hls",
		"-hls_time 2",
		"-hls_list_size 0",
		"-hls_playlist_type event",
		"-hls_segment_type mpegts",
		"-hls_segment_filename /tmp/hls-cache/segment-%06d.ts",
		"/tmp/hls-cache/index.m3u8",
		"-force_key_frames expr:gte(t,n_forced*2)",
		"-ac 2",
		"-ar 48000",
		"scale=w=-2:h=1080",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected HLS args to contain %q, args=%s", expected, joined)
		}
	}
	if containsArg(args, "-re") {
		t.Fatalf("expected completed HLS input to skip -re, args=%s", joined)
	}
	if containsArg(args, "-readrate") || containsArg(args, "-readrate_initial_burst") {
		t.Fatalf("expected completed HLS input to transcode ahead without realtime throttling, args=%s", joined)
	}
}

func TestRewritePlayerHLSPlaylist(t *testing.T) {
	playlist := "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2.000,\nsegment-000000.ts\n#EXTINF:2.000,\nsegment-000001.ts\n"
	rewritten := rewritePlayerHLSPlaylist(playlist, "0123456789abcdef0123456789abcdef01234567")
	if !strings.Contains(rewritten, "/api/media/player/transmission/hls/segment/0123456789abcdef0123456789abcdef01234567/segment-000000.ts") {
		t.Fatalf("expected segment URL rewrite, got=%s", rewritten)
	}
	if !strings.Contains(rewritten, "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES") {
		t.Fatalf("expected explicit playlist start, got=%s", rewritten)
	}
}

func TestBuildPlayerHLSCacheKeyIgnoresChangingLocalFileMetadata(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "video.mkv")
	if err := os.WriteFile(path, []byte("first"), 0o644); err != nil {
		t.Fatalf("write first file: %v", err)
	}
	input := media.PlayerTransmissionResolveStreamInput{
		InfoHash:         "82f49b1a251198d221925f99a4865f114b5e7189",
		FileIndex:        0,
		StartSeconds:     18.828,
		StartBytes:       44820519,
		AudioTrackIndex:  -1,
		OutputResolution: 0,
	}
	result := media.PlayerTransmissionResolveStreamResult{
		FilePath:     path,
		StartSeconds: input.StartSeconds,
		StartBytes:   input.StartBytes,
	}

	first := buildPlayerHLSCacheKey(result, input, 60)
	if err := os.WriteFile(path, []byte("second write changes size and mtime"), 0o644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	second := buildPlayerHLSCacheKey(result, input, 60)
	if first != second {
		t.Fatalf("expected HLS cache key to stay stable while a torrent file is being written, first=%s second=%s", first, second)
	}
}

func TestPlayerFFmpegH264LevelKeepsOriginalAnd4KPlayable(t *testing.T) {
	if got := playerFFmpegH264Level(0); got != "5.1" {
		t.Fatalf("expected original resolution to use 5.1, got=%s", got)
	}
	if got := playerFFmpegH264Level(2160); got != "5.1" {
		t.Fatalf("expected 2160p to use 5.1, got=%s", got)
	}
	if got := playerFFmpegH264Level(1080); got != "4.1" {
		t.Fatalf("expected 1080p to use 4.1, got=%s", got)
	}
}

func TestNormalizePlayerHLSPrebufferSeconds(t *testing.T) {
	for _, value := range []int{-1, 0, 1, 9, 10} {
		if got := normalizePlayerHLSPrebufferSeconds(value); got != 10 {
			t.Fatalf("expected %d to normalize to 10, got=%d", value, got)
		}
	}
	if got := normalizePlayerHLSPrebufferSeconds(91); got != 92 {
		t.Fatalf("expected odd values to align to segment size, got=%d", got)
	}
	if got := normalizePlayerHLSPrebufferSeconds(999); got != playerHLSMaxPrebufferSeconds {
		t.Fatalf("expected max clamp, got=%d", got)
	}
}

func TestWaitForPlayerHLSPrebufferWaitsForTarget(t *testing.T) {
	dir := t.TempDir()
	playlistPath := filepath.Join(dir, "index.m3u8")
	playlist := "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000000,\nsegment-000000.ts\n#EXTINF:2.000000,\nsegment-000001.ts\n"
	if err := os.WriteFile(playlistPath, []byte(playlist), 0o644); err != nil {
		t.Fatalf("write playlist: %v", err)
	}
	touched := false
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	cachedSeconds, ready, err := waitForPlayerHLSPrebuffer(ctx, &playerHLSSession{
		PlaylistPath: playlistPath,
		Done:         make(chan struct{}),
	}, 60, func() {
		touched = true
	})
	if err == nil {
		t.Fatalf("expected wait to continue until target is reached")
	}
	if ready {
		t.Fatalf("expected partial playlist to stay not ready")
	}
	if cachedSeconds != 4 {
		t.Fatalf("expected 4 cached seconds, got=%f", cachedSeconds)
	}
	if !touched {
		t.Fatalf("expected wait loop to refresh session access")
	}
}

func TestWaitForPlayerHLSPrebufferReturnsReadyWhenTargetReached(t *testing.T) {
	dir := t.TempDir()
	playlistPath := filepath.Join(dir, "index.m3u8")
	playlist := "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000000,\nsegment-000000.ts\n#EXTINF:2.000000,\nsegment-000001.ts\n#EXTINF:2.000000,\nsegment-000002.ts\n"
	if err := os.WriteFile(playlistPath, []byte(playlist), 0o644); err != nil {
		t.Fatalf("write playlist: %v", err)
	}
	cachedSeconds, ready, err := waitForPlayerHLSPrebuffer(context.Background(), &playerHLSSession{
		PlaylistPath: playlistPath,
		Done:         make(chan struct{}),
	}, 6, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ready {
		t.Fatalf("expected target playlist to be ready")
	}
	if cachedSeconds != 6 {
		t.Fatalf("expected 6 cached seconds, got=%f", cachedSeconds)
	}
}

func TestPausePlayerHLSGroupKeepsPrebufferingSessions(t *testing.T) {
	b := &builder{hlsSessions: map[string]*playerHLSSession{
		"pending": {GroupKey: "group"},
		"ready":   {GroupKey: "group", ReadyAt: time.Now()},
		"other":   {GroupKey: "other", ReadyAt: time.Now()},
	}}

	stopped, pending := b.pausePlayerHLSGroup("group", false)
	if stopped != 1 || pending != 1 {
		t.Fatalf("expected one ready session stopped and one pending session kept, got stopped=%d pending=%d", stopped, pending)
	}
	if _, ok := b.hlsSessions["ready"]; ok {
		t.Fatalf("expected ready session to be stopped")
	}
	if session := b.hlsSessions["pending"]; session == nil || session.LastAccessedAt.IsZero() || session.LastHeartbeatAt.IsZero() {
		t.Fatalf("expected pending session to remain alive with refreshed heartbeat, session=%#v", session)
	}
	if _, ok := b.hlsSessions["other"]; !ok {
		t.Fatalf("expected unrelated group session to remain")
	}
}

func containsArg(args []string, target string) bool {
	for _, arg := range args {
		if arg == target {
			return true
		}
	}
	return false
}

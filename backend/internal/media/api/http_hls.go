package mediaapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/media"
)

const playerHLSSegmentSeconds = 2
const playerHLSDefaultPrebufferSeconds = 60
const playerHLSMaxPrebufferSeconds = 180
const playerHLSStartupPrebufferSeconds = 4
const playerHLSWaitPollInterval = 250 * time.Millisecond
const playerHLSCacheTTL = 6 * time.Hour
const playerHLSIdleTranscodeTTL = 20 * time.Second
const playerHLSPendingTranscodeTTL = 90 * time.Second
const playerHLSIdleCheckInterval = 5 * time.Second
const playerHLSHeartbeatTimeout = 10 * time.Second
const playerHLSStoppedSegmentGrace = 90 * time.Second

type playerHLSHeartbeatRequest struct {
	State          string  `json:"state"`
	CurrentSeconds float64 `json:"currentSeconds"`
	Visible        bool    `json:"visible"`
}

func (b *builder) playerTransmissionHLSPlaylist(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	startSeconds := parseFloat(c.Query("start"), 0)
	startBytes := parseInt64(c.Query("startBytes"), 0)
	prebufferSeconds := normalizePlayerHLSPrebufferSeconds(parseInt(c.Query("prebuffer"), playerHLSDefaultPrebufferSeconds))
	startupSeconds := normalizePlayerHLSStartupPrebufferSeconds(prebufferSeconds)
	durationSeconds := parseFloat(c.Query("duration"), 0)

	resolveRangeHeader := ""
	if startBytes > 0 {
		resolveRangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
	}
	resolveResult, err := b.service.PlayerTransmissionResolveStream(c.Request.Context(), media.PlayerTransmissionResolveStreamInput{
		InfoHash:                infoHash,
		FileIndex:               fileIndex,
		RangeHeader:             resolveRangeHeader,
		PreferTranscode:         true,
		AudioTrackIndex:         audioTrackIndex,
		OutputResolution:        outputResolution,
		StartSeconds:            startSeconds,
		StartBytes:              startBytes,
		PrebufferSeconds:        prebufferSeconds,
		StartupPrebufferSeconds: startupSeconds,
		DurationSeconds:         durationSeconds,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerInvalidRange):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled), errors.Is(err, media.ErrPlayerTransmissionDisabled), errors.Is(err, media.ErrPlayerTranscodeDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerStreamUnavailable), errors.Is(err, media.ErrPlayerStorageUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	if !resolveResult.Transcode.Enabled {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "player transcode disabled"})
		return
	}

	session, err := b.playerHLSStartOrReuseSession(resolveResult, media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
		StartSeconds:     startSeconds,
		StartBytes:       startBytes,
		PrebufferSeconds: prebufferSeconds,
		DurationSeconds:  durationSeconds,
	}, prebufferSeconds)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	touchSession := func() {
		b.hlsMu.Lock()
		if current := b.hlsSessions[session.Key]; current != nil {
			current.LastAccessedAt = time.Now()
		}
		b.hlsMu.Unlock()
	}
	cachedSeconds, ready, waitErr := waitForPlayerHLSPrebuffer(c.Request.Context(), session, startupSeconds, touchSession)
	if waitErr != nil {
		if errors.Is(waitErr, context.Canceled) || errors.Is(waitErr, context.DeadlineExceeded) {
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": waitErr.Error()})
		return
	}
	b.hlsMu.Lock()
	if current := b.hlsSessions[session.Key]; current != nil {
		now := time.Now()
		current.ReadyAt = now
		current.LastAccessedAt = now
	}
	b.hlsMu.Unlock()
	playlistBytes, err := os.ReadFile(session.PlaylistPath)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	playlist := rewritePlayerHLSPlaylist(string(playlistBytes), session.Key)

	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Content-Type", "application/vnd.apple.mpegurl")
	c.Header("X-Bitmagnet-HLS", "1")
	c.Header("X-Bitmagnet-HLS-Session", session.Key)
	c.Header("X-Bitmagnet-HLS-Prebuffer-Target", strconv.Itoa(prebufferSeconds))
	c.Header("X-Bitmagnet-HLS-Startup-Prebuffer-Target", strconv.Itoa(startupSeconds))
	c.Header("X-Bitmagnet-HLS-Prebuffer-Seconds", strconv.Itoa(int(math.Floor(cachedSeconds))))
	c.Header("X-Bitmagnet-HLS-Prebuffer-Ready", strconv.FormatBool(ready))
	c.String(http.StatusOK, playlist)
}

func (b *builder) playerTransmissionHLSSegment(c *gin.Context) {
	sessionKey := strings.TrimSpace(c.Param("session"))
	segmentName := strings.TrimSpace(c.Param("segment"))
	if !isSafePlayerHLSName(sessionKey) || !isSafePlayerHLSSegmentName(segmentName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hls segment"})
		return
	}

	b.hlsMu.Lock()
	session := b.hlsSessions[sessionKey]
	if session != nil {
		session.LastAccessedAt = time.Now()
	}
	b.hlsMu.Unlock()

	baseDir := filepath.Join(b.hlsCacheDir, sessionKey)
	if session != nil {
		baseDir = session.Dir
	}
	segmentPath := filepath.Join(baseDir, segmentName)
	if filepath.Dir(segmentPath) != baseDir {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hls segment"})
		return
	}
	if _, err := os.Stat(segmentPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "hls segment not found"})
		return
	}
	c.Header("Cache-Control", "public, max-age=3600, immutable")
	c.Header("Content-Type", "video/MP2T")
	c.File(segmentPath)
}

func (b *builder) playerTransmissionHLSStop(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	if infoHash == "" || fileIndex < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hls session"})
		return
	}
	groupKey := buildPlayerHLSGroupKey(media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
	})
	stopped := b.stopPlayerHLSGroup(groupKey, true)
	c.JSON(http.StatusOK, gin.H{"stopped": stopped})
}

func (b *builder) playerTransmissionHLSHeartbeat(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	if infoHash == "" || fileIndex < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hls session"})
		return
	}

	var input playerHLSHeartbeatRequest
	if err := c.ShouldBindJSON(&input); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid heartbeat"})
		return
	}

	groupKey := buildPlayerHLSGroupKey(media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
	})
	state := strings.ToLower(strings.TrimSpace(input.State))
	if state == "idle" {
		stopped := b.stopPlayerHLSGroup(groupKey, true)
		c.JSON(http.StatusOK, gin.H{"active": false, "stopped": stopped})
		return
	}
	if state != "playing" {
		stopped, pending := b.pausePlayerHLSGroup(groupKey, true)
		c.JSON(http.StatusOK, gin.H{"active": false, "stopped": stopped, "pending": pending})
		return
	}

	now := time.Now()
	active := 0
	b.hlsMu.Lock()
	for _, session := range b.hlsSessions {
		if session == nil || session.GroupKey != groupKey {
			continue
		}
		session.PlaybackActive = true
		session.LastHeartbeatAt = now
		session.LastAccessedAt = now
		active++
	}
	b.hlsMu.Unlock()
	c.JSON(http.StatusOK, gin.H{"active": active > 0, "sessions": active})
}

func waitForPlayerHLSPrebuffer(ctx context.Context, session *playerHLSSession, targetSeconds int, touch func()) (float64, bool, error) {
	if targetSeconds <= 0 {
		targetSeconds = 0
	}
	requiredSeconds := float64(targetSeconds)
	if requiredSeconds <= 0 {
		requiredSeconds = 0.1
	}
	timeout := time.Duration(maxInt(20, targetSeconds*4)) * time.Second
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		if touch != nil {
			touch()
		}
		cachedSeconds, endList := playerHLSCachedSeconds(session.PlaylistPath)
		if cachedSeconds >= requiredSeconds || (endList && cachedSeconds > 0) {
			return cachedSeconds, true, nil
		}
		select {
		case <-ctx.Done():
			return cachedSeconds, false, ctx.Err()
		case <-session.Done:
			if session.ExitErr != nil {
				return cachedSeconds, false, fmt.Errorf("hls transcode failed before prebuffer target: %w", session.ExitErr)
			}
			if cachedSeconds > 0 {
				return cachedSeconds, true, nil
			}
			return cachedSeconds, false, fmt.Errorf("hls transcode finished without playable segments")
		case <-timer.C:
			return cachedSeconds, false, fmt.Errorf("hls prebuffer target not ready: cached %.0fs / target %ds", cachedSeconds, targetSeconds)
		case <-time.After(playerHLSWaitPollInterval):
		}
	}
}

func playerHLSCachedSeconds(playlistPath string) (float64, bool) {
	raw, err := os.ReadFile(playlistPath)
	if err != nil {
		return 0, false
	}
	total := 0.0
	endList := false
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#EXTINF:") {
			value := strings.TrimSuffix(strings.TrimPrefix(line, "#EXTINF:"), ",")
			if parsed, err := strconv.ParseFloat(value, 64); err == nil && parsed > 0 {
				total += parsed
			}
		}
		if line == "#EXT-X-ENDLIST" {
			endList = true
		}
	}
	return total, endList
}

func rewritePlayerHLSPlaylist(playlist string, sessionKey string) string {
	lines := strings.Split(playlist, "\n")
	hasStart := false
	insertStartAt := -1
	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#EXT-X-START:") {
			hasStart = true
		}
		if insertStartAt < 0 && (strings.HasPrefix(trimmed, "#EXT-X-VERSION:") || strings.HasPrefix(trimmed, "#EXT-X-TARGETDURATION:")) {
			insertStartAt = idx + 1
		}
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") || strings.HasPrefix(trimmed, "/") {
			continue
		}
		lines[idx] = fmt.Sprintf("/api/media/player/transmission/hls/segment/%s/%s", sessionKey, trimmed)
	}
	if !hasStart {
		if insertStartAt < 0 || insertStartAt > len(lines) {
			insertStartAt = 1
		}
		startTag := "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES"
		lines = append(lines, "")
		copy(lines[insertStartAt+1:], lines[insertStartAt:])
		lines[insertStartAt] = startTag
	}
	return strings.Join(lines, "\n")
}

func normalizePlayerHLSPrebufferSeconds(raw int) int {
	if raw < 10 {
		return 10
	}
	if raw > playerHLSMaxPrebufferSeconds {
		return playerHLSMaxPrebufferSeconds
	}
	return int(math.Ceil(float64(raw)/float64(playerHLSSegmentSeconds))) * playerHLSSegmentSeconds
}

func normalizePlayerHLSStartupPrebufferSeconds(prebufferSeconds int) int {
	startupSeconds := playerHLSStartupPrebufferSeconds
	if startupSeconds < playerHLSSegmentSeconds {
		startupSeconds = playerHLSSegmentSeconds
	}
	if prebufferSeconds > 0 && prebufferSeconds < startupSeconds {
		return prebufferSeconds
	}
	return startupSeconds
}

func isSafePlayerHLSName(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, ch := range value {
		if (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') {
			continue
		}
		return false
	}
	return true
}

func isSafePlayerHLSSegmentName(value string) bool {
	if value == "" || strings.Contains(value, "/") || strings.Contains(value, "\\") || strings.Contains(value, "..") {
		return false
	}
	return strings.HasPrefix(value, "segment-") && strings.HasSuffix(value, ".ts")
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

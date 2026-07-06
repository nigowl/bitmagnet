package mediaapi

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/nigowl/bitmagnet/internal/media"
)

type playerHLSSession struct {
	Key              string
	GroupKey         string
	Dir              string
	PlaylistPath     string
	LastAccessedAt   time.Time
	ReadyAt          time.Time
	LastHeartbeatAt  time.Time
	PlaybackActive   bool
	PrebufferSeconds int
	StartSeconds     float64
	TranscodePaused  bool
	Cmd              *exec.Cmd
	Done             chan struct{}
	DoneObserved     bool
	ExitErr          error
}

func (b *builder) playerHLSStartOrReuseSession(
	resolveResult media.PlayerTransmissionResolveStreamResult,
	input media.PlayerTransmissionResolveStreamInput,
	prebufferSeconds int,
) (*playerHLSSession, error) {
	if b.hlsCacheDir == "" {
		b.hlsCacheDir = filepath.Join("data", "cache", "player-hls")
	}
	if err := os.MkdirAll(b.hlsCacheDir, 0o755); err != nil {
		return nil, err
	}

	sessionKey := buildPlayerHLSCacheKey(resolveResult, input, prebufferSeconds)
	groupKey := buildPlayerHLSGroupKey(input)
	sessionDir := filepath.Join(b.hlsCacheDir, sessionKey)
	playlistPath := filepath.Join(sessionDir, "index.m3u8")

	b.hlsMu.Lock()
	b.cleanupPlayerHLSSessionsLocked(time.Now())
	if existing := b.hlsSessions[sessionKey]; existing != nil {
		cachedSeconds, _ := playerHLSCachedSeconds(existing.PlaylistPath)
		if existing.DoneObserved && existing.ExitErr != nil && cachedSeconds < float64(prebufferSeconds) {
			b.stopPlayerHLSSessionLocked(sessionKey, existing, true)
		} else {
			existing.LastAccessedAt = time.Now()
			if prebufferSeconds > existing.PrebufferSeconds {
				existing.PrebufferSeconds = prebufferSeconds
			}
			b.hlsMu.Unlock()
			return existing, nil
		}
	}
	for key, existing := range b.hlsSessions {
		if existing == nil || existing.GroupKey != groupKey {
			continue
		}
		b.stopPlayerHLSSessionLocked(key, existing, true)
	}
	b.hlsMu.Unlock()

	if err := os.RemoveAll(sessionDir); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return nil, err
	}

	binaryPath := strings.TrimSpace(resolveResult.Transcode.BinaryPath)
	if binaryPath == "" {
		binaryPath = "ffmpeg"
	}
	args := buildPlayerHLSFFmpegArgs(
		resolveResult.FilePath,
		resolveResult.Transcode,
		resolveResult.StartSeconds,
		resolveResult.AudioTrackIndex,
		resolveResult.OutputResolution,
		resolveResult.VideoColor,
		prebufferSeconds,
		sessionDir,
	)
	cmd := exec.Command(binaryPath, args...)
	stderrPath := filepath.Join(sessionDir, "ffmpeg.log")
	stderrFile, err := os.Create(stderrPath)
	if err != nil {
		return nil, err
	}
	cmd.Stderr = stderrFile
	if err := cmd.Start(); err != nil {
		_ = stderrFile.Close()
		return nil, err
	}

	session := &playerHLSSession{
		Key:              sessionKey,
		GroupKey:         groupKey,
		Dir:              sessionDir,
		PlaylistPath:     playlistPath,
		LastAccessedAt:   time.Now(),
		PrebufferSeconds: prebufferSeconds,
		StartSeconds:     math.Max(0, resolveResult.StartSeconds),
		Cmd:              cmd,
		Done:             make(chan struct{}),
	}
	go func() {
		err := cmd.Wait()
		_ = stderrFile.Close()
		b.hlsMu.Lock()
		session.ExitErr = err
		session.DoneObserved = true
		session.Cmd = nil
		b.hlsMu.Unlock()
		close(session.Done)
	}()

	b.hlsMu.Lock()
	b.hlsSessions[sessionKey] = session
	b.hlsMu.Unlock()
	go b.watchPlayerHLSSession(sessionKey)
	return session, nil
}

func (b *builder) cleanupPlayerHLSSessionsLocked(now time.Time) {
	for key, session := range b.hlsSessions {
		if session == nil {
			delete(b.hlsSessions, key)
			continue
		}
		if now.Sub(session.LastAccessedAt) < playerHLSCacheTTL {
			continue
		}
		b.stopPlayerHLSSessionLocked(key, session, true)
	}
}

func (b *builder) watchPlayerHLSSession(sessionKey string) {
	ticker := time.NewTicker(playerHLSIdleCheckInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		b.hlsMu.Lock()
		session := b.hlsSessions[sessionKey]
		if session == nil {
			b.hlsMu.Unlock()
			return
		}
		if session.ReadyAt.IsZero() {
			if now.Sub(session.LastAccessedAt) >= playerHLSPendingTranscodeTTL {
				b.stopPlayerHLSSessionLocked(sessionKey, session, true)
				b.hlsMu.Unlock()
				return
			}
		} else {
			if session.PlaybackActive {
				lastHeartbeat := session.LastHeartbeatAt
				if lastHeartbeat.IsZero() {
					lastHeartbeat = session.ReadyAt
				}
				if now.Sub(lastHeartbeat) >= playerHLSHeartbeatTimeout {
					b.stopPlayerHLSSessionLocked(sessionKey, session, true)
					b.hlsMu.Unlock()
					return
				}
			} else if now.Sub(session.LastAccessedAt) >= playerHLSIdleTranscodeTTL {
				b.stopPlayerHLSSessionLocked(sessionKey, session, true)
				b.hlsMu.Unlock()
				return
			}
		}
		if session.DoneObserved {
			cachedSeconds, _ := playerHLSCachedSeconds(session.PlaylistPath)
			if session.ExitErr != nil && cachedSeconds <= 0 {
				b.stopPlayerHLSSessionLocked(sessionKey, session, true)
				b.hlsMu.Unlock()
				return
			}
		}
		b.hlsMu.Unlock()
	}
}

func (b *builder) stopPlayerHLSGroup(groupKey string, removeFiles bool) int {
	stopped := 0
	b.hlsMu.Lock()
	for key, session := range b.hlsSessions {
		if session == nil || session.GroupKey != groupKey {
			continue
		}
		b.stopPlayerHLSSessionLocked(key, session, removeFiles)
		stopped++
	}
	b.hlsMu.Unlock()
	return stopped
}

func (b *builder) stopPlayerHLSSession(sessionKey string, removeFiles bool) {
	b.hlsMu.Lock()
	if session := b.hlsSessions[sessionKey]; session != nil {
		b.stopPlayerHLSSessionLocked(sessionKey, session, removeFiles)
	}
	b.hlsMu.Unlock()
}

func (b *builder) stopPlayerHLSSessionLocked(sessionKey string, session *playerHLSSession, removeFiles bool) {
	if session.Cmd != nil && session.Cmd.Process != nil {
		_ = session.Cmd.Process.Kill()
	}
	delete(b.hlsSessions, sessionKey)
	if removeFiles {
		b.schedulePlayerHLSSessionDirRemoval(sessionKey, session.Dir)
	}
}

func playerHLSCachedAheadSeconds(session *playerHLSSession, currentSeconds float64) (float64, bool) {
	cachedSeconds, endList := playerHLSCachedSeconds(session.PlaylistPath)
	current := currentSeconds
	if math.IsNaN(current) || math.IsInf(current, 0) || current < session.StartSeconds {
		current = session.StartSeconds
	}
	return math.Max(0, session.StartSeconds+cachedSeconds-current), endList
}

func pausePlayerHLSTranscodeLocked(session *playerHLSSession) {
	if session.TranscodePaused || session.DoneObserved || session.Cmd == nil || session.Cmd.Process == nil {
		return
	}
	if err := session.Cmd.Process.Signal(syscall.SIGSTOP); err == nil {
		session.TranscodePaused = true
	}
}

func resumePlayerHLSTranscodeLocked(session *playerHLSSession) {
	if !session.TranscodePaused || session.DoneObserved || session.Cmd == nil || session.Cmd.Process == nil {
		return
	}
	if err := session.Cmd.Process.Signal(syscall.SIGCONT); err == nil {
		session.TranscodePaused = false
	}
}

func (b *builder) schedulePlayerHLSSessionDirRemoval(sessionKey string, dir string) {
	if strings.TrimSpace(dir) == "" {
		return
	}
	go func() {
		time.Sleep(playerHLSStoppedSegmentGrace)
		b.hlsMu.Lock()
		current := b.hlsSessions[sessionKey]
		b.hlsMu.Unlock()
		if current != nil && current.Dir == dir {
			return
		}
		_ = os.RemoveAll(dir)
	}()
}

func normalizePlayerHLSInfoHashKey(infoHash string) string {
	return strings.TrimSpace(strings.ToLower(infoHash))
}

func buildPlayerHLSCacheKey(resolveResult media.PlayerTransmissionResolveStreamResult, input media.PlayerTransmissionResolveStreamInput, prebufferSeconds int) string {
	payload := fmt.Sprintf(
		"%s|%d|%.3f|%d|%d|%d|%d|%t|%s",
		normalizePlayerHLSInfoHashKey(input.InfoHash),
		input.FileIndex,
		math.Max(0, input.StartSeconds),
		input.StartBytes,
		input.AudioTrackIndex,
		input.OutputResolution,
		prebufferSeconds,
		resolveResult.VideoColor.NeedsToneMap,
		resolveResult.FilePath,
	)
	sum := sha1.Sum([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func buildPlayerHLSGroupKey(input media.PlayerTransmissionResolveStreamInput) string {
	payload := fmt.Sprintf(
		"%s|%d|%d|%d",
		normalizePlayerHLSInfoHashKey(input.InfoHash),
		input.FileIndex,
		input.AudioTrackIndex,
		input.OutputResolution,
	)
	sum := sha1.Sum([]byte(payload))
	return hex.EncodeToString(sum[:])
}

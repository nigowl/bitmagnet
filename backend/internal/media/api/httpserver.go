package mediaapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/httpserver"
	"github.com/nigowl/bitmagnet/internal/media"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type HTTPParams struct {
	fx.In
	Service media.Service
	Config  media.Config
	Logger  *zap.Logger
}

type HTTPResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServer(p HTTPParams) HTTPResult {
	logger := p.Logger
	if logger == nil {
		logger = zap.NewNop()
	}
	return HTTPResult{Option: &builder{
		service:      p.Service,
		streamLogger: logger.Named("media_player_stream"),
		hlsCacheDir:  filepath.Join(p.Config.CacheDir, "player-hls"),
		hlsSessions:  make(map[string]*playerHLSSession),
	}}
}

type builder struct {
	service      media.Service
	streamLogger *zap.Logger
	hlsCacheDir  string
	hlsMu        sync.Mutex
	hlsSessions  map[string]*playerHLSSession
}

const statusClientClosedRequest = 499
const playerHLSSegmentSeconds = 2
const playerHLSDefaultPrebufferSeconds = 60
const playerHLSMaxPrebufferSeconds = 180
const playerHLSWaitPollInterval = 250 * time.Millisecond
const playerHLSCacheTTL = 6 * time.Hour
const playerHLSIdleTranscodeTTL = 20 * time.Second
const playerHLSPendingTranscodeTTL = 90 * time.Second
const playerHLSIdleCheckInterval = 5 * time.Second
const playerHLSHeartbeatTimeout = 10 * time.Second
const playerHLSStoppedSegmentGrace = 90 * time.Second

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
	Cmd              *exec.Cmd
	Done             chan struct{}
	DoneObserved     bool
	ExitErr          error
}

func (b *builder) Key() string {
	return "media"
}

func (b *builder) Apply(e *gin.Engine) error {
	e.GET("/api/media", b.list)
	e.GET("/api/media/:id", b.detail)
	e.POST("/api/media/player/transmission/bootstrap", b.playerTransmissionBootstrap)
	e.POST("/api/media/player/transmission/select-file", b.playerTransmissionSelectFile)
	e.GET("/api/media/player/transmission/audio-tracks", b.playerTransmissionAudioTracks)
	e.GET("/api/media/player/transmission/status", b.playerTransmissionStatus)
	e.GET("/api/media/player/transmission/status/batch", b.playerTransmissionBatchStatus)
	e.DELETE("/api/media/player/transmission/cache", b.playerTransmissionClearCache)
	e.GET("/api/media/player/transmission/stream", b.playerTransmissionStream)
	e.HEAD("/api/media/player/transmission/stream", b.playerTransmissionStream)
	e.GET("/api/media/player/transmission/hls/playlist", b.playerTransmissionHLSPlaylist)
	e.GET("/api/media/player/transmission/hls/segment/:session/:segment", b.playerTransmissionHLSSegment)
	e.POST("/api/media/player/transmission/hls/heartbeat", b.playerTransmissionHLSHeartbeat)
	e.POST("/api/media/player/transmission/hls/stop", b.playerTransmissionHLSStop)
	e.GET("/api/media/player/transmission/thumbnail", b.playerTransmissionThumbnail)
	e.GET("/api/media/player/subtitles", b.playerSubtitleList)
	e.POST("/api/media/player/subtitles", b.playerSubtitleCreate)
	e.PUT("/api/media/player/subtitles/:subtitleId", b.playerSubtitleUpdate)
	e.DELETE("/api/media/player/subtitles/:subtitleId", b.playerSubtitleDelete)
	e.GET("/api/media/player/subtitles/:subtitleId/content", b.playerSubtitleContent)
	e.HEAD("/api/media/player/subtitles/:subtitleId/content", b.playerSubtitleContent)
	e.GET("/api/media/:id/cover/:kind/:size", b.cover)
	e.HEAD("/api/media/:id/cover/:kind/:size", b.cover)
	return nil
}

func (b *builder) list(c *gin.Context) {
	limit := parseInt(c.Query("limit"), 24)
	page := parseInt(c.Query("page"), 1)
	heatDays := parseOptionalPositiveInt(c.Query("heatDays"))
	scoreMin := parseOptionalFloat(c.Query("scoreMin"))
	scoreMax := parseOptionalFloat(c.Query("scoreMax"))

	result, err := b.service.List(c.Request.Context(), media.ListInput{
		Category: c.Query("category"),
		Search:   c.Query("search"),
		Quality:  c.Query("quality"),
		Year:     c.Query("year"),
		Genre:    c.Query("genre"),
		Language: c.Query("language"),
		Country:  c.Query("country"),
		Network:  c.Query("network"),
		Studio:   c.Query("studio"),
		Awards:   c.Query("awards"),
		Cache:    c.Query("cache"),
		Sort:     c.Query("sort"),
		HeatDays: heatDays,
		ScoreMin: scoreMin,
		ScoreMax: scoreMax,
		Limit:    limit,
		Page:     page,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func parseOptionalPositiveInt(value string) *int {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return nil
	}

	return &parsed
}

func (b *builder) detail(c *gin.Context) {
	refresh := parseBool(c.Query("refresh"), false)
	result, err := b.service.Detail(c.Request.Context(), c.Param("id"), media.DetailOptions{
		ForceRefresh: refresh,
	})
	if err != nil {
		if errors.Is(err, media.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionBootstrap(c *gin.Context) {
	var req media.PlayerTransmissionBootstrapInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.PlayerTransmissionBootstrap(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "torrent not found"})
		case errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "playable file not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionSelectFile(c *gin.Context) {
	var req media.PlayerTransmissionSelectFileInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.PlayerTransmissionSelectFile(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "torrent not found"})
		case errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionStatus(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	result, err := b.service.PlayerTransmissionStatus(c.Request.Context(), media.PlayerTransmissionStatusInput{
		InfoHash: infoHash,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "torrent not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionBatchStatus(c *gin.Context) {
	infoHashes := parseStringListQuery(c, "infoHash", "infoHashes")
	result, err := b.service.PlayerTransmissionBatchStatus(c.Request.Context(), media.PlayerTransmissionBatchStatusInput{
		InfoHashes: infoHashes,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionClearCache(c *gin.Context) {
	var req media.PlayerTransmissionClearCacheInput
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if len(req.InfoHashes) == 0 {
		req.InfoHashes = parseStringListQuery(c, "infoHash", "infoHashes")
	}

	result, err := b.service.PlayerTransmissionClearCache(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionAudioTracks(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	result, err := b.service.PlayerTransmissionAudioTracks(c.Request.Context(), media.PlayerTransmissionAudioTracksInput{
		InfoHash:  infoHash,
		FileIndex: fileIndex,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrPlayerTranscodeDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transcode disabled"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionStream(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	preferTranscode := strings.TrimSpace(c.Query("transcode")) == "1"
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	startSeconds := parseFloat(c.Query("start"), 0)
	startBytes := parseInt64(c.Query("startBytes"), 0)
	startedAt := time.Now()
	responseError := ""
	requestClosed := false
	resolveRangeHeader := c.GetHeader("Range")
	if preferTranscode {
		resolveRangeHeader = ""
		if startBytes > 0 {
			resolveRangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
		}
	}

	baseFields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("request_uri", c.Request.URL.RequestURI()),
		zap.String("query", c.Request.URL.RawQuery),
		zap.String("info_hash", infoHash),
		zap.Int("file_index", fileIndex),
		zap.Bool("prefer_transcode", preferTranscode),
		zap.Int("audio_track_index", audioTrackIndex),
		zap.Int("output_resolution", outputResolution),
		zap.Float64("start_seconds", startSeconds),
		zap.Int64("start_bytes", startBytes),
		zap.String("range", c.GetHeader("Range")),
		zap.String("resolve_range", resolveRangeHeader),
		zap.String("client_ip", c.ClientIP()),
		zap.String("user_agent", c.Request.UserAgent()),
	}
	defer func() {
		statusCode := c.Writer.Status()
		if statusCode <= 0 {
			statusCode = http.StatusOK
		}
		fields := append([]zap.Field{}, baseFields...)
		fields = append(
			fields,
			zap.Int("status", statusCode),
			zap.Duration("latency", time.Since(startedAt)),
			zap.String("stream_source", c.Writer.Header().Get("X-Bitmagnet-Stream-Source")),
			zap.String("stream_path", c.Writer.Header().Get("X-Bitmagnet-Stream-Path")),
		)
		if responseError != "" {
			fields = append(fields, zap.String("response_error", responseError))
		}
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("gin_errors", c.Errors.String()))
		}
		switch {
		case requestClosed || statusCode == statusClientClosedRequest:
			b.streamLogger.Debug("player stream request closed", fields...)
		case statusCode >= 500:
			b.streamLogger.Warn("player stream request failed", fields...)
		case statusCode >= 400:
			b.streamLogger.Info("player stream request rejected", fields...)
		case preferTranscode || strings.TrimSpace(c.Writer.Header().Get("X-Bitmagnet-Transcode")) != "":
			b.streamLogger.Info("player stream request", fields...)
		default:
			b.streamLogger.Debug("player stream request", fields...)
		}
	}()

	resolveResult, err := b.service.PlayerTransmissionResolveStream(c.Request.Context(), media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		RangeHeader:      resolveRangeHeader,
		PreferTranscode:  preferTranscode,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
		StartSeconds:     startSeconds,
		StartBytes:       startBytes,
	})
	if err != nil {
		responseError = err.Error()
		switch {
		case isBenignStreamingError(err):
			requestClosed = true
			c.Status(statusClientClosedRequest)
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerInvalidRange):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrPlayerStreamUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "stream data not ready yet"})
		case errors.Is(err, media.ErrPlayerStorageUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if !preferTranscode {
		if !resolveResult.Completed {
			responseError = media.ErrPlayerStreamUnavailable.Error()
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "stream data not ready yet"})
			return
		}
		b.playerTransmissionStreamDirect(c, resolveResult)
		return
	}

	if !resolveResult.Transcode.Enabled {
		responseError = media.ErrPlayerTranscodeDisabled.Error()
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "player transcode disabled"})
		return
	}
	b.playerTransmissionStreamTranscoded(c, resolveResult)
}

func (b *builder) playerTransmissionStreamDirect(c *gin.Context, resolveResult media.PlayerTransmissionResolveStreamResult) {
	inputPath := strings.TrimSpace(resolveResult.FilePath)
	file, err := os.Open(inputPath)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		if err == nil {
			err = fmt.Errorf("stream path is not a file")
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Content-Type", resolveResult.ContentType)
	c.Header("Accept-Ranges", "bytes")
	c.Header("X-Bitmagnet-Stream-Source", "local")
	c.Header("X-Bitmagnet-Stream-Path", inputPath)
	http.ServeContent(c.Writer, c.Request, stat.Name(), stat.ModTime(), file)
}

func (b *builder) playerTransmissionHLSPlaylist(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	startSeconds := parseFloat(c.Query("start"), 0)
	startBytes := parseInt64(c.Query("startBytes"), 0)
	prebufferSeconds := normalizePlayerHLSPrebufferSeconds(parseInt(c.Query("prebuffer"), playerHLSDefaultPrebufferSeconds))
	durationSeconds := parseFloat(c.Query("duration"), 0)

	resolveRangeHeader := ""
	if startBytes > 0 {
		resolveRangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
	}
	resolveResult, err := b.service.PlayerTransmissionResolveStream(c.Request.Context(), media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		RangeHeader:      resolveRangeHeader,
		PreferTranscode:  true,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
		StartSeconds:     startSeconds,
		StartBytes:       startBytes,
		PrebufferSeconds: prebufferSeconds,
		DurationSeconds:  durationSeconds,
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
	cachedSeconds, ready, waitErr := waitForPlayerHLSPrebuffer(c.Request.Context(), session, prebufferSeconds, touchSession)
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

type playerHLSHeartbeatRequest struct {
	State          string  `json:"state"`
	CurrentSeconds float64 `json:"currentSeconds"`
	Visible        bool    `json:"visible"`
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

func (b *builder) playerTransmissionThumbnail(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	seconds := math.Max(0, parseFloat(c.Query("seconds"), 0))
	startBytes := parseInt64(c.Query("startBytes"), 0)
	if startBytes < 0 {
		startBytes = 0
	}

	rangeHeader := ""
	if startBytes > 0 {
		rangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	resolveResult, err := b.service.PlayerTransmissionResolveStream(ctx, media.PlayerTransmissionResolveStreamInput{
		InfoHash:        infoHash,
		FileIndex:       fileIndex,
		RangeHeader:     rangeHeader,
		PreferTranscode: true,
		StartSeconds:    seconds,
		StartBytes:      startBytes,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerInvalidRange):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled), errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerStreamUnavailable), errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
			c.JSON(http.StatusAccepted, gin.H{"error": "thumbnail source not ready"})
		case errors.Is(err, media.ErrPlayerStorageUnavailable):
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

	binaryPath := strings.TrimSpace(resolveResult.Transcode.BinaryPath)
	if binaryPath == "" {
		binaryPath = "ffmpeg"
	}
	args := buildPlayerFFmpegThumbnailArgs(resolveResult.FilePath, seconds)
	cmd := exec.CommandContext(ctx, binaryPath, args...)
	output, err := cmd.Output()
	if err != nil || len(output) == 0 {
		message := "thumbnail unavailable"
		if err != nil {
			message = err.Error()
		}
		c.JSON(http.StatusAccepted, gin.H{"error": message})
		return
	}

	c.Header("Cache-Control", "public, max-age=300")
	c.Header("Content-Type", "image/jpeg")
	c.Header("X-Bitmagnet-Thumbnail-Second", strconv.FormatFloat(seconds, 'f', 3, 64))
	c.Data(http.StatusOK, "image/jpeg", output)
}

func (b *builder) playerSubtitleList(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	result, err := b.service.PlayerSubtitleList(c.Request.Context(), media.PlayerSubtitleListInput{
		InfoHash: infoHash,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": result})
}

func (b *builder) playerSubtitleCreate(c *gin.Context) {
	var req media.PlayerSubtitleCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := b.service.PlayerSubtitleCreate(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerSubtitleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": result})
}

func (b *builder) playerSubtitleUpdate(c *gin.Context) {
	subtitleID := parseInt64(c.Param("subtitleId"), 0)
	if subtitleID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subtitleId"})
		return
	}
	var req media.PlayerSubtitleUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	req.ID = subtitleID
	result, err := b.service.PlayerSubtitleUpdate(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerSubtitleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerSubtitleNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": result})
}

func (b *builder) playerSubtitleDelete(c *gin.Context) {
	subtitleID := parseInt64(c.Param("subtitleId"), 0)
	if subtitleID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subtitleId"})
		return
	}
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	err := b.service.PlayerSubtitleDelete(c.Request.Context(), media.PlayerSubtitleDeleteInput{
		InfoHash: infoHash,
		ID:       subtitleID,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerSubtitleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerSubtitleNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) playerSubtitleContent(c *gin.Context) {
	subtitleID := parseInt64(c.Param("subtitleId"), 0)
	if subtitleID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subtitleId"})
		return
	}
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	result, err := b.service.PlayerSubtitleContent(c.Request.Context(), media.PlayerSubtitleContentInput{
		InfoHash: infoHash,
		ID:       subtitleID,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerSubtitleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerSubtitleNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.Header("Content-Type", "text/vtt; charset=utf-8")
	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Last-Modified", result.UpdatedAt.UTC().Format(http.TimeFormat))
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}
	c.String(http.StatusOK, result.ContentVTT)
}

func (b *builder) playerTransmissionStreamTranscoded(c *gin.Context, resolveResult media.PlayerTransmissionResolveStreamResult) {
	binaryPath := strings.TrimSpace(resolveResult.Transcode.BinaryPath)
	if binaryPath == "" {
		binaryPath = "ffmpeg"
	}
	inputPath := resolveResult.FilePath
	streamSource := "local+ffmpeg"
	streamPath := strings.TrimSpace(resolveResult.FilePath)
	transcodeStartSeconds := resolveResult.StartSeconds
	transcodeSeekStartBytes := resolveResult.StartBytes

	args := buildPlayerFFmpegArgs(
		inputPath,
		resolveResult.Transcode,
		transcodeStartSeconds,
		resolveResult.AudioTrackIndex,
		resolveResult.OutputResolution,
		!resolveResult.Completed,
	)
	cmd := exec.CommandContext(c.Request.Context(), binaryPath, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Content-Type", "video/mp4")
	c.Header("Accept-Ranges", "none")
	c.Header("X-Bitmagnet-Transcode", "ffmpeg")
	c.Header("X-Bitmagnet-Transcode-Binary", binaryPath)
	c.Header("X-Bitmagnet-Transcode-Start", strconv.FormatFloat(transcodeStartSeconds, 'f', 3, 64))
	c.Header("X-Bitmagnet-Transcode-Seek-Bytes", strconv.FormatInt(transcodeSeekStartBytes, 10))
	c.Header("X-Bitmagnet-Transcode-Audio-Track", strconv.Itoa(resolveResult.AudioTrackIndex))
	c.Header("X-Bitmagnet-Transcode-Resolution", strconv.Itoa(resolveResult.OutputResolution))
	c.Header("X-Bitmagnet-Transcode-Realtime-Input", strconv.FormatBool(!resolveResult.Completed))
	c.Header("X-Bitmagnet-Stream-Source", streamSource)
	if streamPath != "" {
		c.Header("X-Bitmagnet-Stream-Path", streamPath)
	}
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}

	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer stdout.Close()

	reader := bufio.NewReaderSize(stdout, 64*1024)
	firstChunk := make([]byte, 32*1024)
	type firstReadResult struct {
		n   int
		err error
	}
	firstReadCh := make(chan firstReadResult, 1)
	go func() {
		n, err := reader.Read(firstChunk)
		firstReadCh <- firstReadResult{n: n, err: err}
	}()

	var firstRead firstReadResult
	firstChunkTimeout := 15 * time.Second
	if transcodeStartSeconds > 0 {
		firstChunkTimeout += 20 * time.Second
	}
	select {
	case firstRead = <-firstReadCh:
	case <-c.Request.Context().Done():
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		c.Status(statusClientClosedRequest)
		return
	case <-time.After(firstChunkTimeout):
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = fmt.Sprintf(
				"ffmpeg produced no output within %ds (source=%s,start=%.3fs,input=%s)",
				int(firstChunkTimeout.Seconds()),
				streamSource,
				transcodeStartSeconds,
				inputPath,
			)
		}
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": message})
		return
	}

	if firstRead.n <= 0 {
		if waitErr := cmd.Wait(); waitErr != nil {
			message := strings.TrimSpace(stderr.String())
			if isExpectedFFmpegExit(waitErr, c.Request.Context(), message) {
				return
			}
			if message == "" {
				message = waitErr.Error()
			}
			if isTransientFFmpegStartupFailure(message) || isRetryableFFmpegFailure(message) {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", message)})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("ffmpeg stream failed: %s", message)})
			return
		}
		if firstRead.err != nil && !errors.Is(firstRead.err, io.EOF) {
			message := strings.TrimSpace(firstRead.err.Error())
			if isTransientFFmpegStartupFailure(message) || isRetryableFFmpegFailure(message) {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", message)})
				return
			}
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", firstRead.err.Error())})
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ffmpeg startup pending: empty output"})
		return
	}

	c.Status(http.StatusOK)
	if _, err := c.Writer.Write(firstChunk[:firstRead.n]); err != nil && !isBenignStreamingError(err) {
		c.Error(err)
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		return
	}
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}

	if firstRead.err != nil && !errors.Is(firstRead.err, io.EOF) && !isBenignStreamingError(firstRead.err) {
		c.Error(firstRead.err)
	}
	if firstRead.err == nil {
		if _, err := io.Copy(c.Writer, reader); err != nil && !errors.Is(err, io.EOF) && !isBenignStreamingError(err) {
			c.Error(err)
		}
	}
	if err := cmd.Wait(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if isExpectedFFmpegExit(err, c.Request.Context(), message) {
			return
		}
		if message == "" {
			message = err.Error()
		}
		c.Error(fmt.Errorf("ffmpeg stream failed: %s", message))
	}
}

func isBenignStreamingError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, net.ErrClosed) {
		return true
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "broken pipe") ||
		strings.Contains(message, "connection reset by peer") ||
		strings.Contains(message, "client disconnected")
}

func isExpectedFFmpegExit(waitErr error, requestCtx context.Context, stderrText string) bool {
	if waitErr == nil {
		return true
	}
	if errors.Is(waitErr, context.Canceled) || errors.Is(requestCtx.Err(), context.Canceled) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(waitErr.Error()))
	stderrNormalized := strings.ToLower(strings.TrimSpace(stderrText))
	if strings.Contains(message, "signal: killed") {
		if stderrNormalized == "" ||
			strings.Contains(stderrNormalized, "broken pipe") ||
			strings.Contains(stderrNormalized, "connection reset by peer") {
			return true
		}
	}
	return false
}

func isTransientFFmpegStartupFailure(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" {
		return true
	}
	transientTokens := []string{
		"moov atom not found",
		"invalid data found when processing input",
		"error reading header",
		"could not find codec parameters",
		"could not find stream information",
		"cannot determine format of input stream",
		"end of file",
		"input/output error",
	}
	for _, token := range transientTokens {
		if strings.Contains(normalized, token) {
			return true
		}
	}
	return false
}

func isRetryableFFmpegFailure(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" {
		return true
	}
	nonRetryable := []string{
		"executable file not found",
		"unknown encoder",
		"option not found",
		"invalid argument",
		"permission denied",
	}
	for _, token := range nonRetryable {
		if strings.Contains(normalized, token) {
			return false
		}
	}
	return true
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

func (b *builder) pausePlayerHLSGroup(groupKey string, removeFiles bool) (int, int) {
	stopped := 0
	pending := 0
	now := time.Now()
	b.hlsMu.Lock()
	for key, session := range b.hlsSessions {
		if session == nil || session.GroupKey != groupKey {
			continue
		}
		session.PlaybackActive = false
		session.LastHeartbeatAt = now
		session.LastAccessedAt = now
		if session.ReadyAt.IsZero() {
			pending++
			continue
		}
		b.stopPlayerHLSSessionLocked(key, session, removeFiles)
		stopped++
	}
	b.hlsMu.Unlock()
	return stopped, pending
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

func buildPlayerHLSCacheKey(resolveResult media.PlayerTransmissionResolveStreamResult, input media.PlayerTransmissionResolveStreamInput, prebufferSeconds int) string {
	payload := fmt.Sprintf(
		"%s|%d|%.3f|%d|%d|%d|%d|%s",
		strings.TrimSpace(strings.ToLower(input.InfoHash)),
		input.FileIndex,
		math.Max(0, input.StartSeconds),
		input.StartBytes,
		input.AudioTrackIndex,
		input.OutputResolution,
		prebufferSeconds,
		resolveResult.FilePath,
	)
	sum := sha1.Sum([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func buildPlayerHLSGroupKey(input media.PlayerTransmissionResolveStreamInput) string {
	payload := fmt.Sprintf(
		"%s|%d|%d|%d",
		strings.TrimSpace(strings.ToLower(input.InfoHash)),
		input.FileIndex,
		input.AudioTrackIndex,
		input.OutputResolution,
	)
	sum := sha1.Sum([]byte(payload))
	return hex.EncodeToString(sum[:])
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

func playerFFmpegH264Level(outputResolution int) string {
	if outputResolution <= 0 || outputResolution >= 1440 {
		return "5.1"
	}
	return "4.1"
}

func buildPlayerFFmpegArgs(
	filePath string,
	options media.PlayerFFmpegTranscodeSettings,
	startSeconds float64,
	audioTrackIndex int,
	outputResolution int,
	realTimeInput bool,
) []string {
	preset := strings.TrimSpace(options.Preset)
	if preset == "" {
		preset = "veryfast"
	}
	crf := options.CRF
	if crf < 16 || crf > 38 {
		crf = 23
	}
	audioBitrate := options.AudioBitrateKbps
	if audioBitrate < 64 || audioBitrate > 320 {
		audioBitrate = 128
	}

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
		"-profile:v", "main",
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
	if outputResolution > 0 {
		args = append(args, "-vf", fmt.Sprintf("scale=w=-2:h=%d:force_original_aspect_ratio=decrease:force_divisible_by=2", outputResolution))
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
	outputDir string,
) []string {
	preset := strings.TrimSpace(options.Preset)
	if preset == "" {
		preset = "veryfast"
	}
	crf := options.CRF
	if crf < 16 || crf > 38 {
		crf = 23
	}
	audioBitrate := options.AudioBitrateKbps
	if audioBitrate < 64 || audioBitrate > 320 {
		audioBitrate = 128
	}

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
		"-profile:v", "main",
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
	if outputResolution > 0 {
		args = append(args, "-vf", fmt.Sprintf("scale=w=-2:h=%d:force_original_aspect_ratio=decrease:force_divisible_by=2", outputResolution))
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

func (b *builder) cover(c *gin.Context) {
	headOnly := c.Request.Method == http.MethodHead

	result, err := b.service.Cover(c.Request.Context(), c.Param("id"), c.Param("kind"), c.Param("size"))
	if err != nil {
		switch {
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrCoverNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "cover not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if result.Pending {
		c.Header("Cache-Control", "no-store, max-age=0")
		c.Header("X-Bitmagnet-Cover-Status", "pending")
		if headOnly {
			c.Status(http.StatusAccepted)
			return
		}
		c.Data(http.StatusAccepted, "image/svg+xml; charset=utf-8", []byte(pendingCoverSVG()))
		return
	}

	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	c.Header("X-Bitmagnet-Cover-Status", "ready")
	if headOnly {
		c.Status(http.StatusOK)
		return
	}
	c.File(result.FilePath)
}

func pendingCoverSVG() string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 720" role="img" aria-label="Loading cover">
<defs>
<linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" stop-color="#1f2937"/>
<stop offset="50%" stop-color="#374151"/>
<stop offset="100%" stop-color="#1f2937"/>
<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="1.2s" repeatCount="indefinite"/>
</linearGradient>
<linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" stop-color="#000000" stop-opacity="0"/>
<stop offset="45%" stop-color="#ffffff" stop-opacity="0.06"/>
<stop offset="55%" stop-color="#ffffff" stop-opacity="0.26"/>
<stop offset="65%" stop-color="#ffffff" stop-opacity="0.06"/>
<stop offset="100%" stop-color="#000000" stop-opacity="0"/>
</linearGradient>
<clipPath id="poster-clip">
<rect x="24" y="24" width="432" height="672" rx="18"/>
</clipPath>
</defs>
<rect width="480" height="720" fill="#111827"/>
<rect x="24" y="24" width="432" height="672" rx="18" fill="url(#card-bg)"/>
<g clip-path="url(#poster-clip)">
<rect x="-432" y="24" width="432" height="672" fill="url(#shine)">
<animate attributeName="x" from="-432" to="480" dur="1.2s" repeatCount="indefinite"/>
</rect>
</g>
<rect x="92" y="500" width="296" height="10" rx="5" fill="#4b5563" opacity="0.8"/>
<rect x="132" y="524" width="216" height="10" rx="5" fill="#4b5563" opacity="0.7"/>
<g transform="translate(240 612)">
<circle r="18" fill="none" stroke="#4b5563" stroke-width="4" opacity="0.28"/>
<path d="M 0 -18 A 18 18 0 0 1 15.6 -9" fill="none" stroke="#d1d5db" stroke-width="4" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1s" repeatCount="indefinite"/>
</path>
</g>
<text x="50%" y="660" text-anchor="middle" fill="#d1d5db" font-size="22" font-family="sans-serif">Loading cover...</text>
</svg>`
}

func parseInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseBool(raw string, fallback bool) bool {
	switch raw {
	case "1", "true", "TRUE", "True", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "False", "no", "NO", "off", "OFF":
		return false
	default:
		return fallback
	}
}

func parseFloat(raw string, fallback float64) float64 {
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return fallback
	}
	return value
}

func parseOptionalFloat(raw string) *float64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return nil
	}
	return &value
}

func parseInt64(raw string, fallback int64) int64 {
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func parseStringListQuery(c *gin.Context, keys ...string) []string {
	if len(keys) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		values := c.QueryArray(key)
		if len(values) == 0 {
			if raw := c.Query(key); raw != "" {
				values = []string{raw}
			}
		}
		for _, raw := range values {
			parts := strings.Split(raw, ",")
			for _, part := range parts {
				value := strings.TrimSpace(part)
				if value == "" {
					continue
				}
				if _, ok := seen[value]; ok {
					continue
				}
				seen[value] = struct{}{}
				result = append(result, value)
			}
		}
	}
	return result
}

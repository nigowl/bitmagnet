package mediaapi

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
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
	}}
}

type builder struct {
	service      media.Service
	streamLogger *zap.Logger
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
		RangeHeader:      c.GetHeader("Range"),
		PreferTranscode:  preferTranscode,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
		StartSeconds:     startSeconds,
		StartBytes:       startBytes,
	})
	if err != nil {
		responseError = err.Error()
		switch {
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

func buildPlayerFFmpegArgs(
	filePath string,
	options media.PlayerFFmpegTranscodeSettings,
	startSeconds float64,
	audioTrackIndex int,
	outputResolution int,
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
	if filePath != "pipe:0" {
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
		"-level", "4.1",
		"-g", "48",
		"-keyint_min", "48",
		"-sc_threshold", "0",
		"-c:a", "aac",
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

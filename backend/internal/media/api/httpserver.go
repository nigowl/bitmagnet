package mediaapi

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

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

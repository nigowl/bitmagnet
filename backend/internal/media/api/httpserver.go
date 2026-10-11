package mediaapi

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/auth"
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
	e.GET("/api/topics", b.listTopics)
	e.GET("/api/topics/:id", b.topicDetail)
	e.GET("/api/admin/topics", b.requireAdmin(), b.listAdminTopics)
	e.GET("/api/admin/topics/:id", b.requireAdmin(), b.getAdminTopic)
	e.POST("/api/admin/topics", b.requireAdmin(), b.createTopic)
	e.POST("/api/admin/topics/rebuild", b.requireAdmin(), b.rebuildTopics)
	e.PUT("/api/admin/topics/:id", b.requireAdmin(), b.updateTopic)
	e.DELETE("/api/admin/topics/:id", b.requireAdmin(), b.deleteTopic)
	e.POST("/api/media/:id/block", b.block)
	e.DELETE("/api/media/:id/block", b.unblock)
	e.POST("/api/media/player/transmission/bootstrap", b.playerTransmissionBootstrap)
	e.POST("/api/media/player/transmission/select-file", b.playerTransmissionSelectFile)
	e.GET("/api/media/player/transmission/audio-tracks", b.playerTransmissionAudioTracks)
	e.GET("/api/media/player/transmission/status", b.playerTransmissionStatus)
	e.GET("/api/media/player/transmission/status/batch", b.playerTransmissionBatchStatus)
	e.POST("/api/media/player/transmission/cache/queue", b.playerTransmissionEnqueueCache)
	e.GET("/api/media/player/transmission/cache/queue", b.playerTransmissionCacheQueue)
	e.POST("/api/media/player/transmission/cache/cancel", b.playerTransmissionCancelCache)
	e.DELETE("/api/media/player/transmission/cache/queue", b.playerTransmissionDeleteCache)
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
		Favorite: c.Query("favorite"),
		Sort:     c.Query("sort"),
		HeatDays: heatDays,
		ScoreMin: scoreMin,
		ScoreMax: scoreMax,
		Limit:    limit,
		Page:     page,
		ViewerID: viewerID(c),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) listTopics(c *gin.Context) {
	result, err := b.service.ListTopics(c.Request.Context(), media.TopicListInput{
		Kind:     c.Query("kind"),
		Search:   c.Query("search"),
		Limit:    parseInt(c.Query("limit"), 24),
		Page:     parseInt(c.Query("page"), 1),
		ViewerID: viewerID(c),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) topicDetail(c *gin.Context) {
	result, err := b.service.TopicDetail(c.Request.Context(), c.Param("id"), media.ListInput{
		Limit:    parseInt(c.Query("limit"), 40),
		Page:     parseInt(c.Query("page"), 1),
		ViewerID: viewerID(c),
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

func (b *builder) listAdminTopics(c *gin.Context) {
	result, err := b.service.ListAdminTopics(c.Request.Context(), media.TopicAdminListInput{
		Limit: parseInt(c.Query("limit"), 20),
		Page:  parseInt(c.Query("page"), 1),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) getAdminTopic(c *gin.Context) {
	result, err := b.service.GetAdminTopic(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeTopicError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) createTopic(c *gin.Context) {
	var input media.TopicAdminInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := b.service.CreateTopic(c.Request.Context(), input)
	if err != nil {
		writeTopicError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) updateTopic(c *gin.Context) {
	var input media.TopicAdminInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := b.service.UpdateTopic(c.Request.Context(), c.Param("id"), input)
	if err != nil {
		writeTopicError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) deleteTopic(c *gin.Context) {
	if err := b.service.DeleteTopic(c.Request.Context(), c.Param("id")); err != nil {
		writeTopicError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) rebuildTopics(c *gin.Context) {
	result, err := b.service.RebuildTopics(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		viewer, ok := auth.ViewerFromContext(c.Request.Context())
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		if viewer.Role != auth.RoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func writeTopicError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, media.ErrInvalidTopic):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid topic"})
	case errors.Is(err, media.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func (b *builder) detail(c *gin.Context) {
	refresh := parseBool(c.Query("refresh"), false)
	result, err := b.service.Detail(c.Request.Context(), c.Param("id"), media.DetailOptions{
		ForceRefresh: refresh,
		ViewerID:     viewerID(c),
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

func (b *builder) block(c *gin.Context) {
	viewer, ok := auth.ViewerFromContext(c.Request.Context())
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := b.service.Block(c.Request.Context(), viewer.ID, c.Param("id")); err != nil {
		if errors.Is(err, media.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) unblock(c *gin.Context) {
	viewer, ok := auth.ViewerFromContext(c.Request.Context())
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := b.service.Unblock(c.Request.Context(), viewer.ID, c.Param("id")); err != nil {
		if errors.Is(err, media.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func viewerID(c *gin.Context) int64 {
	viewer, ok := auth.ViewerFromContext(c.Request.Context())
	if !ok {
		return 0
	}
	return viewer.ID
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

func (b *builder) playerTransmissionEnqueueCache(c *gin.Context) {
	var req media.PlayerTransmissionCacheQueueInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.PlayerTransmissionEnqueueCache(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrPlayerCacheQueueDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player cache queue disabled"})
		case errors.Is(err, media.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "torrent not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionCacheQueue(c *gin.Context) {
	result, err := b.service.PlayerTransmissionCacheQueue(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (b *builder) playerTransmissionCancelCache(c *gin.Context) {
	var req media.PlayerTransmissionCacheQueueActionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.PlayerTransmissionCancelCache(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
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

func (b *builder) playerTransmissionDeleteCache(c *gin.Context) {
	var req media.PlayerTransmissionCacheQueueActionInput
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if strings.TrimSpace(req.InfoHash) == "" {
		req.InfoHash = strings.TrimSpace(c.Query("infoHash"))
	}

	result, err := b.service.PlayerTransmissionDeleteCache(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid infoHash"})
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

package mediaapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/media"
)

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

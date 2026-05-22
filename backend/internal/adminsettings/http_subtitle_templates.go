package adminsettings

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/subtitles"
)

func (b *builder) listSubtitleTemplates(c *gin.Context) {
	templates, err := b.service.ListSubtitleTemplates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"templates": templates})
}

func (b *builder) createSubtitleTemplate(c *gin.Context) {
	var req subtitles.Input
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	template, err := b.service.CreateSubtitleTemplate(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, subtitles.ErrInvalidTemplate):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"template": template})
}

func (b *builder) updateSubtitleTemplate(c *gin.Context) {
	templateID := c.Param("templateId")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "templateId is required"})
		return
	}

	var req subtitles.Input
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	template, err := b.service.UpdateSubtitleTemplate(c.Request.Context(), templateID, req)
	if err != nil {
		switch {
		case errors.Is(err, subtitles.ErrInvalidTemplate):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, subtitles.ErrTemplateNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"template": template})
}

func (b *builder) deleteSubtitleTemplate(c *gin.Context) {
	templateID := c.Param("templateId")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "templateId is required"})
		return
	}

	if err := b.service.DeleteSubtitleTemplate(c.Request.Context(), templateID); err != nil {
		switch {
		case errors.Is(err, subtitles.ErrInvalidTemplate):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, subtitles.ErrTemplateNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

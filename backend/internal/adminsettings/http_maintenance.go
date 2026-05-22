package adminsettings

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

type startMaintenanceTaskRequest struct {
	Type      string `json:"type"`
	Limit     int    `json:"limit"`
	BatchSize int    `json:"batchSize"`
}

type maintenanceStatsQuery struct {
	Type string `form:"type"`
}

func (b *builder) startMaintenanceTask(c *gin.Context) {
	var req startMaintenanceTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	task, err := b.service.StartMaintenanceTask(c.Request.Context(), MaintenanceTaskInput{
		Type:      req.Type,
		Limit:     req.Limit,
		BatchSize: req.BatchSize,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"task": task})
}

func (b *builder) getMaintenanceTask(c *gin.Context) {
	taskID := c.Param("taskId")
	task, err := b.service.GetMaintenanceTask(c.Request.Context(), taskID)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, ErrTaskNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"task": task})
}

func (b *builder) getMaintenanceStats(c *gin.Context) {
	var query maintenanceStatsQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid query"})
		return
	}

	stats, err := b.service.GetMaintenanceStats(c.Request.Context(), query.Type)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"stats": stats})
}

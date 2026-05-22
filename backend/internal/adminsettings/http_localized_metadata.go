package adminsettings

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type backfillLocalizedRequest struct {
	Limit int `json:"limit"`
}

func (b *builder) backfillLocalizedMetadata(c *gin.Context) {
	var req backfillLocalizedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.BackfillLocalizedMetadata(c.Request.Context(), req.Limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

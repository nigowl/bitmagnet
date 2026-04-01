package adminsettings

import (
	"errors"
	"net/http"

	"github.com/bitmagnet-io/bitmagnet/internal/auth"
	"github.com/bitmagnet-io/bitmagnet/internal/httpserver"
	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

type HTTPParams struct {
	fx.In
	Service     Service
	AuthService auth.Service
}

type HTTPResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServer(p HTTPParams) HTTPResult {
	return HTTPResult{Option: &builder{
		service:     p.Service,
		authService: p.AuthService,
	}}
}

type builder struct {
	service     Service
	authService auth.Service
}

func (b *builder) Key() string {
	return "admin_settings"
}

func (b *builder) Apply(e *gin.Engine) error {
	e.GET("/api/admin/settings", b.authMiddleware(), b.requireAdmin(), b.getSettings)
	e.PUT("/api/admin/settings", b.authMiddleware(), b.requireAdmin(), b.updateSettings)
	e.POST("/api/admin/settings/plugins/:pluginKey/test", b.authMiddleware(), b.requireAdmin(), b.testPlugin)
	e.POST("/api/admin/settings/media/backfill-localized", b.authMiddleware(), b.requireAdmin(), b.backfillLocalizedMetadata)
	e.POST("/api/admin/maintenance/tasks", b.authMiddleware(), b.requireAdmin(), b.startMaintenanceTask)
	e.GET("/api/admin/maintenance/tasks/:taskId", b.authMiddleware(), b.requireAdmin(), b.getMaintenanceTask)
	return nil
}

func (b *builder) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := auth.BearerToken(c.GetHeader("Authorization"))
		if token != "" {
			if viewer, err := b.authService.AuthenticateToken(c.Request.Context(), token); err == nil {
				c.Request = c.Request.WithContext(auth.WithViewer(c.Request.Context(), viewer))
			}
		}
		c.Next()
	}
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

func (b *builder) getSettings(c *gin.Context) {
	settings, err := b.service.Get(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

func (b *builder) updateSettings(c *gin.Context) {
	var req UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	settings, err := b.service.Update(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

func (b *builder) testPlugin(c *gin.Context) {
	pluginKey := c.Param("pluginKey")
	if pluginKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pluginKey is required"})
		return
	}

	var req PluginTestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.TestPlugin(c.Request.Context(), pluginKey, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, ErrUnsupportedPlugin):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

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

type startMaintenanceTaskRequest struct {
	Type  string `json:"type"`
	Limit int    `json:"limit"`
}

func (b *builder) startMaintenanceTask(c *gin.Context) {
	var req startMaintenanceTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	task, err := b.service.StartMaintenanceTask(c.Request.Context(), MaintenanceTaskInput{
		Type:  req.Type,
		Limit: req.Limit,
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

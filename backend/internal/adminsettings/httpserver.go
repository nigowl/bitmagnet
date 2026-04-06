package adminsettings

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/nigowl/bitmagnet/internal/httpserver"
	"github.com/nigowl/bitmagnet/internal/subtitles"
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
	e.GET("/api/settings/home", b.getHomeSettings)
	e.GET("/api/admin/settings", b.authMiddleware(), b.requireAdmin(), b.getSettings)
	e.GET("/api/admin/settings/runtime-status", b.authMiddleware(), b.requireAdmin(), b.getRuntimeStatus)
	e.POST("/api/admin/settings/workers/:workerKey/restart", b.authMiddleware(), b.requireAdmin(), b.restartWorker)
	e.PUT("/api/admin/settings", b.authMiddleware(), b.requireAdmin(), b.updateSettings)
	e.GET("/api/admin/settings/subtitle-templates", b.authMiddleware(), b.requireAdmin(), b.listSubtitleTemplates)
	e.POST("/api/admin/settings/subtitle-templates", b.authMiddleware(), b.requireAdmin(), b.createSubtitleTemplate)
	e.PUT("/api/admin/settings/subtitle-templates/:templateId", b.authMiddleware(), b.requireAdmin(), b.updateSubtitleTemplate)
	e.DELETE("/api/admin/settings/subtitle-templates/:templateId", b.authMiddleware(), b.requireAdmin(), b.deleteSubtitleTemplate)
	e.POST("/api/admin/settings/plugins/:pluginKey/test", b.authMiddleware(), b.requireAdmin(), b.testPlugin)
	e.POST("/api/admin/settings/player/transmission/test", b.authMiddleware(), b.requireAdmin(), b.testPlayerTransmission)
	e.POST("/api/admin/settings/player/transmission/download-mapping/test", b.authMiddleware(), b.requireAdmin(), b.testPlayerDownloadMapping)
	e.POST("/api/admin/settings/player/ffmpeg/test", b.authMiddleware(), b.requireAdmin(), b.testPlayerFFmpeg)
	e.GET("/api/admin/settings/player/transmission/tasks", b.authMiddleware(), b.requireAdmin(), b.listPlayerTransmissionTasks)
	e.GET("/api/admin/settings/player/transmission/tasks/stats", b.authMiddleware(), b.requireAdmin(), b.getPlayerTransmissionTaskStats)
	e.DELETE("/api/admin/settings/player/transmission/tasks/:taskId", b.authMiddleware(), b.requireAdmin(), b.deletePlayerTransmissionTask)
	e.POST("/api/admin/settings/player/transmission/tasks/cleanup", b.authMiddleware(), b.requireAdmin(), b.cleanupPlayerTransmissionTasks)
	e.POST("/api/admin/settings/media/backfill-localized", b.authMiddleware(), b.requireAdmin(), b.backfillLocalizedMetadata)
	e.POST("/api/admin/maintenance/tasks", b.authMiddleware(), b.requireAdmin(), b.startMaintenanceTask)
	e.GET("/api/admin/maintenance/stats", b.authMiddleware(), b.requireAdmin(), b.getMaintenanceStats)
	e.GET("/api/admin/maintenance/tasks/:taskId", b.authMiddleware(), b.requireAdmin(), b.getMaintenanceTask)
	return nil
}

func (b *builder) getHomeSettings(c *gin.Context) {
	home, err := b.service.GetHome(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"home": home})
}

func (b *builder) getRuntimeStatus(c *gin.Context) {
	status, err := b.service.GetRuntimeStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": status})
}

func (b *builder) restartWorker(c *gin.Context) {
	workerKey := c.Param("workerKey")
	if workerKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workerKey is required"})
		return
	}

	report, err := b.service.RestartWorker(c.Request.Context(), workerKey)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, ErrWorkerNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, ErrWorkerRegistryUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"report": report,
	})
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

func (b *builder) testPlayerTransmission(c *gin.Context) {
	var req TransmissionTestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.TestPlayerTransmission(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

func (b *builder) testPlayerDownloadMapping(c *gin.Context) {
	var req DownloadMappingTestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.TestPlayerDownloadMapping(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

func (b *builder) testPlayerFFmpeg(c *gin.Context) {
	var req FFmpegTestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := b.service.TestPlayerFFmpeg(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

func (b *builder) listPlayerTransmissionTasks(c *gin.Context) {
	tasks, err := b.service.ListPlayerTransmissionTasks(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

func (b *builder) getPlayerTransmissionTaskStats(c *gin.Context) {
	stats, err := b.service.GetPlayerTransmissionTaskStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stats": stats})
}

func (b *builder) deletePlayerTransmissionTask(c *gin.Context) {
	taskID, err := strconv.ParseInt(c.Param("taskId"), 10, 64)
	if err != nil || taskID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}

	result, deleteErr := b.service.DeletePlayerTransmissionTask(c.Request.Context(), TransmissionTaskDeleteInput{
		ID: taskID,
	})
	if deleteErr != nil {
		switch {
		case errors.Is(deleteErr, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": deleteErr.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": deleteErr.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"result": result})
}

func (b *builder) cleanupPlayerTransmissionTasks(c *gin.Context) {
	result, err := b.service.RunPlayerTransmissionCleanup(c.Request.Context())
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"result": result})
}

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

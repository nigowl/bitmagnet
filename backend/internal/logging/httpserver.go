package logging

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/nigowl/bitmagnet/internal/httpserver"
	"go.uber.org/fx"
)

type HTTPServerParams struct {
	fx.In
	Config      Config
	LogBuffer   *LogBuffer
	AuthService auth.Service
}

type HTTPServerResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServerOption(params HTTPServerParams) HTTPServerResult {
	return HTTPServerResult{
		Option: logsBuilder{
			config:      params.Config,
			logBuffer:   params.LogBuffer,
			authService: params.AuthService,
		},
	}
}

type logsBuilder struct {
	config      Config
	logBuffer   *LogBuffer
	authService auth.Service
}

func (logsBuilder) Key() string {
	return "logs"
}

func (b logsBuilder) Apply(e *gin.Engine) error {
	e.GET("/api/logs", b.authMiddleware(), b.requireAdmin(), func(c *gin.Context) {
		lines := clampLines(c.DefaultQuery("lines", "100"))
		page := clampPage(c.DefaultQuery("page", "1"))
		category := c.DefaultQuery("category", LogCategoryHTTPServer)
		file := c.Query("file")
		c.JSON(http.StatusOK, b.readLogs(category, file, lines, page))
	})

	return nil
}

func (b logsBuilder) authMiddleware() gin.HandlerFunc {
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

func (logsBuilder) requireAdmin() gin.HandlerFunc {
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

type LogCategoryInfo struct {
	Key string `json:"key"`
}

type LogFileInfo struct {
	Name      string    `json:"name"`
	SizeBytes int64     `json:"sizeBytes"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type LogsResponse struct {
	Enabled      bool              `json:"enabled"`
	Path         string            `json:"path"`
	Categories   []LogCategoryInfo `json:"categories"`
	Category     string            `json:"category"`
	Files        []LogFileInfo     `json:"files"`
	SelectedFile string            `json:"selectedFile,omitempty"`
	UpdatedAt    *time.Time        `json:"updatedAt,omitempty"`
	Page         int               `json:"page"`
	LinesPerPage int               `json:"linesPerPage"`
	TotalPages   int               `json:"totalPages"`
	TotalLines   int               `json:"totalLines"`
	Lines        []string          `json:"lines"`
	Message      string            `json:"message,omitempty"`
}

func clampLines(value string) int {
	lines, err := strconv.Atoi(value)
	if err != nil {
		return 100
	}

	if lines < 50 {
		return 50
	}

	if lines > 1000 {
		return 1000
	}

	return lines
}

func clampPage(value string) int {
	page, err := strconv.Atoi(value)
	if err != nil || page < 1 {
		return 1
	}

	return page
}

func pages(totalLines int, linesPerPage int) int {
	if totalLines <= 0 || linesPerPage <= 0 {
		return 0
	}
	return (totalLines + linesPerPage - 1) / linesPerPage
}

func (b logsBuilder) readLogs(category string, file string, lines int, page int) LogsResponse {
	resp := LogsResponse{
		Enabled:      b.config.FileRotator.Enabled,
		Path:         b.config.FileRotator.Path,
		Category:     normalizeLogCategory(category),
		Page:         page,
		LinesPerPage: lines,
		Categories: func() []LogCategoryInfo {
			keys := availableLogCategoryKeys()
			out := make([]LogCategoryInfo, 0, len(keys))
			for _, key := range keys {
				out = append(out, LogCategoryInfo{Key: key})
			}
			return out
		}(),
	}

	if !b.config.FileRotator.Enabled {
		bufferLines, totalLines, updatedAt := b.logBuffer.SnapshotPage(page, lines)
		resp.TotalLines = totalLines
		resp.TotalPages = pages(totalLines, lines)
		resp.Lines = bufferLines
		if updatedAt != nil {
			resp.UpdatedAt = updatedAt
		}
		if totalLines == 0 {
			resp.Message = "No backend log lines have been captured yet."
		}
		return resp
	}

	files, err := listLogFiles(b.config.FileRotator, resp.Category)
	if err != nil {
		resp.Message = err.Error()
		return resp
	}

	resp.Files = make([]LogFileInfo, 0, len(files))
	availableFiles := make(map[string]logFileInfo, len(files))
	for _, item := range files {
		availableFiles[item.Name] = item
		resp.Files = append(resp.Files, LogFileInfo{
			Name:      item.Name,
			SizeBytes: item.SizeBytes,
			UpdatedAt: item.UpdatedAt,
		})
	}

	selectedFile := file
	if _, ok := availableFiles[selectedFile]; !ok {
		selectedFile = ""
	}
	if selectedFile == "" && len(files) > 0 {
		selectedFile = files[0].Name
	}
	resp.SelectedFile = selectedFile

	if selectedFile == "" {
		resp.Message = "No log files available for this category."
		return resp
	}

	if fileInfo, ok := availableFiles[selectedFile]; ok {
		updatedAt := fileInfo.UpdatedAt
		resp.UpdatedAt = &updatedAt
	}

	logLines, totalLines, readErr := readLogFilePage(logFilePath(b.config.FileRotator, selectedFile), page, lines)
	if readErr != nil {
		resp.Message = readErr.Error()
		return resp
	}

	resp.TotalLines = totalLines
	resp.TotalPages = pages(totalLines, lines)
	if resp.TotalPages > 0 && resp.Page > resp.TotalPages {
		resp.Page = resp.TotalPages
		logLines, totalLines, readErr = readLogFilePage(logFilePath(b.config.FileRotator, selectedFile), resp.Page, lines)
		if readErr != nil {
			resp.Message = readErr.Error()
			return resp
		}
		resp.TotalLines = totalLines
		resp.TotalPages = pages(totalLines, lines)
	}
	resp.Lines = logLines
	if len(logLines) == 0 {
		resp.Message = "No log lines available for the selected page."
	}

	return resp
}

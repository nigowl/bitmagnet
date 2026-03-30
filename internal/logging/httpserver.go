package logging

import (
	"net/http"
	"strconv"
	"time"

	"github.com/bitmagnet-io/bitmagnet/internal/httpserver"
	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

type HTTPServerParams struct {
	fx.In
	Config    Config
	LogBuffer *LogBuffer
}

type HTTPServerResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServerOption(params HTTPServerParams) HTTPServerResult {
	return HTTPServerResult{
		Option: logsBuilder{
			config:    params.Config,
			logBuffer: params.LogBuffer,
		},
	}
}

type logsBuilder struct {
	config    Config
	logBuffer *LogBuffer
}

func (logsBuilder) Key() string {
	return "logs"
}

func (b logsBuilder) Apply(e *gin.Engine) error {
	e.GET("/api/logs", func(c *gin.Context) {
		lines := clampLines(c.DefaultQuery("lines", "100"))
		page := clampPage(c.DefaultQuery("page", "1"))
		c.JSON(http.StatusOK, b.readLogs(lines, page))
	})

	return nil
}

type LogsResponse struct {
	Enabled     bool       `json:"enabled"`
	Path        string     `json:"path"`
	CurrentFile string     `json:"currentFile,omitempty"`
	UpdatedAt   *time.Time `json:"updatedAt,omitempty"`
	TotalLines  int        `json:"totalLines"`
	Lines       []string   `json:"lines"`
	Message     string     `json:"message,omitempty"`
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

func (b logsBuilder) readLogs(lines int, page int) LogsResponse {
	bufferLines, totalLines, updatedAt := b.logBuffer.SnapshotPage(page, lines)

	resp := LogsResponse{
		Enabled:    true,
		TotalLines: totalLines,
		Lines:      bufferLines,
	}

	if b.config.FileRotator.Enabled {
		resp.Path = b.config.FileRotator.Path
	}

	if updatedAt != nil {
		resp.UpdatedAt = updatedAt
	}

	if totalLines == 0 {
		resp.Message = "No backend log lines have been captured yet."
	}

	return resp
}

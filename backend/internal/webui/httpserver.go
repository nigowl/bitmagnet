package webui

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/bitmagnet-io/bitmagnet/internal/httpserver"
	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type Params struct {
	fx.In
	Logger *zap.SugaredLogger
}

type Result struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func New(p Params) Result {
	frontendBaseURL := strings.TrimRight(os.Getenv("WEBUI_BASE_URL"), "/")
	if frontendBaseURL == "" {
		frontendBaseURL = "http://localhost:3334"
	}

	return Result{
		Option: &builder{
			logger:          p.Logger.Named("webui"),
			frontendBaseURL: frontendBaseURL,
		},
	}
}

type builder struct {
	logger          *zap.SugaredLogger
	frontendBaseURL string
}

func (*builder) Key() string {
	return "webui"
}

func (b *builder) Apply(e *gin.Engine) error {
	if _, err := url.ParseRequestURI(b.frontendBaseURL); err != nil {
		return fmt.Errorf("invalid WEBUI_BASE_URL %q: %w", b.frontendBaseURL, err)
	}

	b.logger.Infof("webui endpoints are redirected to frontend: %s", b.frontendBaseURL)

	redirect := func(c *gin.Context, suffix string) {
		target := b.frontendBaseURL + suffix
		c.Redirect(http.StatusMovedPermanently, target)
	}

	e.GET("/", func(c *gin.Context) {
		redirect(c, "/")
	})
	e.GET("/webui", func(c *gin.Context) {
		redirect(c, "/")
	})
	e.GET("/webui/*filepath", func(c *gin.Context) {
		filepath := c.Param("filepath")
		if filepath == "" {
			filepath = "/"
		}
		redirect(c, filepath)
	})

	return nil
}

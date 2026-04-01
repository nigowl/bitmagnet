package media

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/bitmagnet-io/bitmagnet/internal/httpserver"
	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

type HTTPParams struct {
	fx.In
	Service Service
}

type HTTPResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServer(p HTTPParams) HTTPResult {
	return HTTPResult{Option: &builder{service: p.Service}}
}

type builder struct {
	service Service
}

func (b *builder) Key() string {
	return "media"
}

func (b *builder) Apply(e *gin.Engine) error {
	e.GET("/api/media", b.list)
	e.GET("/api/media/:id", b.detail)
	e.GET("/api/media/:id/cover/:kind/:size", b.cover)
	return nil
}

func (b *builder) list(c *gin.Context) {
	limit := parseInt(c.Query("limit"), 24)
	page := parseInt(c.Query("page"), 1)

	result, err := b.service.List(c.Request.Context(), ListInput{
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
		Sort:     c.Query("sort"),
		Limit:    limit,
		Page:     page,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) detail(c *gin.Context) {
	result, err := b.service.Detail(c.Request.Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (b *builder) cover(c *gin.Context) {
	result, err := b.service.Cover(c.Request.Context(), c.Param("id"), c.Param("kind"), c.Param("size"))
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound), errors.Is(err, ErrCoverNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "cover not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	c.File(result.FilePath)
}

func parseInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

package webui

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func newTestBuilder(baseURL string) *builder {
	return &builder{
		logger:          zap.NewNop().Sugar(),
		frontendBaseURL: baseURL,
	}
}

func TestBuilderApplyRejectsInvalidBaseURL(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	b := newTestBuilder("://bad-url")

	if err := b.Apply(router); err == nil {
		t.Fatalf("expected invalid WEBUI_BASE_URL error")
	}
}

func TestBuilderRedirectsRootToFrontend(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	b := newTestBuilder("http://localhost:3334")
	if err := b.Apply(router); err != nil {
		t.Fatalf("apply: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusMovedPermanently {
		t.Fatalf("expected status %d, got %d", http.StatusMovedPermanently, rec.Code)
	}

	if got := rec.Header().Get("Location"); got != "http://localhost:3334/" {
		t.Fatalf("expected redirect location %q, got %q", "http://localhost:3334/", got)
	}
}

func TestBuilderRedirectsWebUIPathToFrontend(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	b := newTestBuilder("http://localhost:3334")
	if err := b.Apply(router); err != nil {
		t.Fatalf("apply: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/webui/media", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusMovedPermanently {
		t.Fatalf("expected status %d, got %d", http.StatusMovedPermanently, rec.Code)
	}

	if got := rec.Header().Get("Location"); got != "http://localhost:3334/media" {
		t.Fatalf("expected redirect location %q, got %q", "http://localhost:3334/media", got)
	}
}

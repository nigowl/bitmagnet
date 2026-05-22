package tmdb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestRequesterLazyRetriesTransientInitError(t *testing.T) {
	var authRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authentication":
			if authRequests.Add(1) == 1 {
				http.Error(w, "temporary failure", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write([]byte(`{}`))
		case "/search/movie":
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	requester := newTestRequesterLazy(server.URL)
	if _, err := requester.Request(context.Background(), "/search/movie", nil, nil); err == nil {
		t.Fatal("expected first request to fail during TMDB validation")
	}

	if _, err := requester.Request(context.Background(), "/search/movie", nil, nil); err != nil {
		t.Fatalf("expected transient validation failure to be retried, got %v", err)
	}
	if got := authRequests.Load(); got != 2 {
		t.Fatalf("expected validation to be retried once, got %d authentication requests", got)
	}
}

func TestRequesterLazyCachesSuccessfulRequester(t *testing.T) {
	var authRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authentication":
			authRequests.Add(1)
			_, _ = w.Write([]byte(`{}`))
		case "/search/movie":
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	requester := newTestRequesterLazy(server.URL)
	for i := 0; i < 2; i++ {
		if _, err := requester.Request(context.Background(), "/search/movie", nil, nil); err != nil {
			t.Fatalf("request %d failed: %v", i+1, err)
		}
	}
	if got := authRequests.Load(); got != 1 {
		t.Fatalf("expected validated requester to be reused, got %d authentication requests", got)
	}
}

func TestRequesterLazyCachesPermanentInitError(t *testing.T) {
	requester := requesterLazy{
		config: Config{
			Enabled: false,
		},
		logger: zap.NewNop().Sugar(),
	}

	if _, err := requester.Request(context.Background(), "/search/movie", nil, nil); !errors.Is(err, errTmdbDisabled) {
		t.Fatalf("expected disabled error, got %v", err)
	}
	if _, err := requester.Request(context.Background(), "/search/movie", nil, nil); !errors.Is(err, errTmdbDisabled) {
		t.Fatalf("expected cached disabled error, got %v", err)
	}
}

func newTestRequesterLazy(baseURL string) *requesterLazy {
	return &requesterLazy{
		config: Config{
			Enabled:        true,
			BaseURL:        baseURL,
			APIKey:         "test",
			RateLimit:      time.Nanosecond,
			RateLimitBurst: 1,
		},
		logger: zap.NewNop().Sugar(),
	}
}

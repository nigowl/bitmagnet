package httpserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type testOption struct {
	key string
}

func (o testOption) Key() string {
	return o.key
}

func (testOption) Apply(*gin.Engine) error {
	return nil
}

type orderedTestOption struct {
	testOption
	order int
}

func (o orderedTestOption) Order() int {
	return o.order
}

func TestResolveOptionsSortsByOrderThenKey(t *testing.T) {
	options := []Option{
		testOption{key: "admin_settings"},
		orderedTestOption{testOption: testOption{key: "auth"}, order: -100},
		testOption{key: "media"},
		orderedTestOption{testOption: testOption{key: "cors"}, order: -90},
	}

	resolved, err := resolveOptions([]string{"*"}, options)
	require.NoError(t, err)
	require.Len(t, resolved, 4)
	require.Equal(t, "auth", resolved[0].Key())
	require.Equal(t, "cors", resolved[1].Key())
	require.Equal(t, "admin_settings", resolved[2].Key())
	require.Equal(t, "media", resolved[3].Key())
}

func TestResolveOptionsSelectedSubsetStillSorted(t *testing.T) {
	options := []Option{
		testOption{key: "admin_settings"},
		orderedTestOption{testOption: testOption{key: "auth"}, order: -100},
		orderedTestOption{testOption: testOption{key: "cors"}, order: -90},
		testOption{key: "media"},
	}

	resolved, err := resolveOptions([]string{"media", "auth", "admin_settings"}, options)
	require.NoError(t, err)
	require.Len(t, resolved, 3)
	require.Equal(t, "auth", resolved[0].Key())
	require.Equal(t, "admin_settings", resolved[1].Key())
	require.Equal(t, "media", resolved[2].Key())
}

func TestAPIEnvelopeMiddlewareWrapsSuccessJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(apiEnvelopeMiddleware())
	router.GET("/api/example", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/example", nil)
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &payload))
	require.EqualValues(t, 0, payload["code"])
	require.Equal(t, "success", payload["message"])
	require.Equal(t, true, payload["data"].(map[string]any)["ok"])
}

func TestAPIEnvelopeMiddlewareWrapsErrorJSONAsHTTP200(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(apiEnvelopeMiddleware())
	router.GET("/api/example", func(c *gin.Context) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/example", nil)
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &payload))
	require.EqualValues(t, http.StatusBadRequest, payload["code"])
	require.Equal(t, "invalid input", payload["message"])
	require.Nil(t, payload["data"])
}

func TestAPIEnvelopeMiddlewareWrapsEmptySuccessAsCodeZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(apiEnvelopeMiddleware())
	router.POST("/api/example", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/example", nil)
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &payload))
	require.EqualValues(t, 0, payload["code"])
	require.Equal(t, "success", payload["message"])
	require.Nil(t, payload["data"])
}

func TestAPIEnvelopeMiddlewareKeepsExistingEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(apiEnvelopeMiddleware())
	router.GET("/api/example", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"code": 7, "message": "custom", "data": gin.H{"ok": false}})
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/example", nil)
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &payload))
	require.EqualValues(t, 7, payload["code"])
	require.Equal(t, "custom", payload["message"])
	require.Equal(t, false, payload["data"].(map[string]any)["ok"])
}

func TestAPIEnvelopeMiddlewareSkipsStreamRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(apiEnvelopeMiddleware())
	router.GET("/api/media/player/transmission/stream", func(c *gin.Context) {
		c.Data(http.StatusPartialContent, "video/mp4", []byte("media"))
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/media/player/transmission/stream", nil)
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusPartialContent, response.Code)
	require.Equal(t, "media", response.Body.String())
}

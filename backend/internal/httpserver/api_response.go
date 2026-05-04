package httpserver

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type apiResponseEnvelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type apiEnvelopeWriter struct {
	gin.ResponseWriter
	body   bytes.Buffer
	status int
}

func (w *apiEnvelopeWriter) WriteHeader(code int) {
	w.status = code
}

func (w *apiEnvelopeWriter) WriteHeaderNow() {
	if w.status == 0 {
		w.status = http.StatusOK
	}
}

func (w *apiEnvelopeWriter) Write(data []byte) (int, error) {
	w.WriteHeaderNow()
	return w.body.Write(data)
}

func (w *apiEnvelopeWriter) WriteString(data string) (int, error) {
	w.WriteHeaderNow()
	return w.body.WriteString(data)
}

func apiEnvelopeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !shouldEnvelopeAPIResponse(c.Request.Method, c.Request.URL.Path) {
			c.Next()
			return
		}

		writer := &apiEnvelopeWriter{ResponseWriter: c.Writer, status: http.StatusOK}
		c.Writer = writer
		c.Next()
		c.Writer = writer.ResponseWriter

		status := writer.status
		if status == 0 {
			status = http.StatusOK
		}
		body := bytes.TrimSpace(writer.body.Bytes())
		if len(body) == 0 {
			if status >= http.StatusBadRequest {
				writeAPIEnvelope(c, status, apiEnvelopeMessage(status, nil), nil)
				return
			}
			writeAPIEnvelope(c, 0, "success", nil)
			return
		}

		contentType := writer.Header().Get("Content-Type")
		if !strings.Contains(strings.ToLower(contentType), "json") {
			c.Writer.WriteHeader(status)
			_, _ = c.Writer.Write(writer.body.Bytes())
			return
		}

		var parsed any
		if err := json.Unmarshal(body, &parsed); err != nil {
			c.Writer.WriteHeader(status)
			_, _ = c.Writer.Write(writer.body.Bytes())
			return
		}
		if isAPIEnvelope(parsed) {
			writer.Header().Del("Content-Length")
			c.Writer.Header().Set("Content-Type", "application/json; charset=utf-8")
			c.Writer.WriteHeader(http.StatusOK)
			_, _ = c.Writer.Write(body)
			return
		}

		if status >= http.StatusBadRequest {
			writeAPIEnvelope(c, status, apiEnvelopeMessage(status, parsed), nil)
			return
		}
		writeAPIEnvelope(c, 0, "success", body)
	}
}

func shouldEnvelopeAPIResponse(method string, path string) bool {
	if method == http.MethodHead || method == http.MethodOptions {
		return false
	}
	if !strings.HasPrefix(path, "/api/") {
		return false
	}
	switch {
	case path == "/api/media/player/transmission/stream":
		return false
	case path == "/api/media/player/transmission/hls/playlist":
		return false
	case strings.HasPrefix(path, "/api/media/player/transmission/hls/segment/"):
		return false
	case path == "/api/media/player/transmission/thumbnail":
		return false
	case strings.HasPrefix(path, "/api/media/player/subtitles/") && strings.HasSuffix(path, "/content"):
		return false
	case strings.HasPrefix(path, "/api/media/") && strings.Contains(path, "/cover/"):
		return false
	default:
		return true
	}
}

func writeAPIEnvelope(c *gin.Context, code int, message string, data json.RawMessage) {
	if data == nil {
		data = json.RawMessage("null")
	}
	payload, err := json.Marshal(apiResponseEnvelope{
		Code:    code,
		Message: message,
		Data:    data,
	})
	if err != nil {
		payload = []byte(`{"code":500,"message":"failed to encode response","data":null}`)
	}
	c.Writer.Header().Del("Content-Length")
	c.Writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	c.Writer.WriteHeader(http.StatusOK)
	_, _ = c.Writer.Write(payload)
}

func apiEnvelopeMessage(status int, parsed any) string {
	if object, ok := parsed.(map[string]any); ok {
		for _, key := range []string{"message", "error"} {
			if value, ok := object[key]; ok {
				if text := strings.TrimSpace(toEnvelopeString(value)); text != "" {
					return text
				}
			}
		}
	}
	if statusText := strings.TrimSpace(http.StatusText(status)); statusText != "" {
		return statusText
	}
	return "request failed"
}

func toEnvelopeString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		if typed == nil {
			return ""
		}
		return strings.TrimSpace(strings.Trim(encodeEnvelopeValue(typed), `"`))
	}
}

func encodeEnvelopeValue(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(raw)
}

func isAPIEnvelope(parsed any) bool {
	object, ok := parsed.(map[string]any)
	if !ok {
		return false
	}
	_, hasCode := object["code"]
	_, hasMessage := object["message"]
	_, hasData := object["data"]
	return hasCode && hasMessage && hasData
}

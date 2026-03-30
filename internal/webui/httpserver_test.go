package webui

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestWrappedFSOpenRootReturnsDirectory(t *testing.T) {
	fsys := wrappedFs{
		FileSystem: http.FS(fstest.MapFS{
			"index.html": &fstest.MapFile{Data: []byte("index")},
			"assets/app.js": &fstest.MapFile{Data: []byte("console.log('ok')")},
		}),
	}

	file, err := fsys.Open("/")
	if err != nil {
		t.Fatalf("open root: %v", err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		t.Fatalf("stat root: %v", err)
	}

	if !info.IsDir() {
		t.Fatalf("expected root to be directory")
	}
}

func TestWrappedFSOpenMissingPathFallsBackToIndex(t *testing.T) {
	fsys := wrappedFs{
		FileSystem: http.FS(fstest.MapFS{
			"index.html": &fstest.MapFile{Data: []byte("index")},
		}),
	}

	file, err := fsys.Open("/media")
	if err != nil {
		t.Fatalf("open missing path: %v", err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		t.Fatalf("stat fallback file: %v", err)
	}

	if info.IsDir() {
		t.Fatalf("expected fallback to index file, got directory")
	}

	content, err := io.ReadAll(file)
	if err != nil {
		t.Fatalf("read fallback content: %v", err)
	}

	if string(content) != "index" {
		t.Fatalf("expected fallback content to match index.html")
	}
}

func TestWrappedFSRootServesIndexWithoutServerError(t *testing.T) {
	handler := http.StripPrefix("/webui", http.FileServer(wrappedFs{
		FileSystem: http.FS(fstest.MapFS{
			"index.html": &fstest.MapFile{Data: []byte("<html>index</html>")},
		}),
	}))

	req := httptest.NewRequest(http.MethodGet, "/webui/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d and body %q", http.StatusOK, rec.Code, rec.Body.String())
	}

	if !strings.Contains(rec.Body.String(), "index") {
		t.Fatalf("expected index html in response body")
	}
}

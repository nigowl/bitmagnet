package media

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCoverCacheVariantPathUsesNestedDirectories(t *testing.T) {
	cache := &coverCache{cacheDir: t.TempDir()}

	path := cache.variantPath("abcdef123456", coverKindPoster, coverSizeMD)
	wantSuffix := filepath.Join("covers", "ab", "cd", "abcdef123456", "poster-md.jpg")
	if !strings.HasSuffix(path, wantSuffix) {
		t.Fatalf("variant path = %q, want suffix %q", path, wantSuffix)
	}
}

func TestCoverCacheCleanupRemovesLeastRecentlyUsedFiles(t *testing.T) {
	cache := &coverCache{cacheDir: t.TempDir()}
	oldPath := cache.variantPath("abcdef123456", coverKindPoster, coverSizeSM)
	newPath := cache.variantPath("abcdef123456", coverKindPoster, coverSizeMD)
	if err := os.MkdirAll(filepath.Dir(oldPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldPath, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newPath, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}

	oldTime := time.Now().Add(-time.Hour)
	if err := os.Chtimes(oldPath, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}

	removed, remaining, err := cache.cleanup(3)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 || remaining != 3 {
		t.Fatalf("cleanup = removed %d, remaining %d; want removed 1, remaining 3", removed, remaining)
	}
	if fileExists(oldPath) {
		t.Fatal("least recently used file was not removed")
	}
	if !fileExists(newPath) {
		t.Fatal("newer file was removed")
	}
}

package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type coverCache struct {
	cacheDir     string
	imageBaseURL string
	httpClient   *http.Client
	locks        sync.Map
	cleanupMu    sync.Mutex
}

func newCoverCache(config Config) (*coverCache, error) {
	cacheDir := strings.TrimSpace(config.CacheDir)
	if cacheDir == "" {
		cacheDir = "data/cache"
	}

	if !filepath.IsAbs(cacheDir) {
		abs, err := filepath.Abs(cacheDir)
		if err != nil {
			return nil, fmt.Errorf("resolve cache dir: %w", err)
		}
		cacheDir = abs
	}

	timeout := config.HTTPTimeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}

	imageBaseURL := strings.TrimRight(strings.TrimSpace(config.ImageBaseURL), "/")
	if imageBaseURL == "" {
		imageBaseURL = "https://image.tmdb.org/t/p"
	}

	return &coverCache{
		cacheDir:     cacheDir,
		imageBaseURL: imageBaseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

func (c *coverCache) resolvePath(ctx context.Context, mediaID string, kind coverKind, size coverSize, sourcePath string) (string, error) {
	mediaID = strings.TrimSpace(mediaID)
	sourcePath = strings.TrimSpace(sourcePath)
	if mediaID == "" || sourcePath == "" {
		return "", ErrCoverNotFound
	}

	cachePath := c.variantPath(mediaID, kind, size)
	if fileExists(cachePath) {
		_ = touchFile(cachePath)
		return cachePath, nil
	}

	lockKey := fmt.Sprintf("%s:%s", mediaID, kind)
	lock := c.lockFor(lockKey)
	lock.Lock()
	defer lock.Unlock()

	if fileExists(cachePath) {
		_ = touchFile(cachePath)
		return cachePath, nil
	}

	sourceImage, err := c.loadSourceImage(ctx, sourcePath)
	if err != nil {
		return "", err
	}

	if err := c.writeAllVariants(mediaID, kind, sourceImage); err != nil {
		return "", err
	}

	if !fileExists(cachePath) {
		return "", fmt.Errorf("cover cache file not generated: %s", cachePath)
	}

	_ = touchFile(cachePath)
	return cachePath, nil
}

func (c *coverCache) writeAllVariants(mediaID string, kind coverKind, source image.Image) error {
	c.cleanupMu.Lock()
	defer c.cleanupMu.Unlock()

	if err := os.MkdirAll(filepath.Dir(c.variantPath(mediaID, kind, coverSizeXL)), 0o755); err != nil {
		return fmt.Errorf("create media cache dir: %w", err)
	}

	variants := coverVariants[kind]
	for _, variant := range variants {
		targetPath := c.variantPath(mediaID, kind, variant.size)
		if fileExists(targetPath) {
			continue
		}

		render := resizeToWidth(source, variant.width)
		if err := writeJPEGAtomic(targetPath, render); err != nil {
			return fmt.Errorf("write variant %s: %w", targetPath, err)
		}
	}

	return nil
}

func (c *coverCache) loadSourceImage(ctx context.Context, sourcePath string) (image.Image, error) {
	sourceURL := c.sourceURL(sourcePath)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download source image from %s: %w", sourceURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrCoverNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download source image failed from %s: status %d", sourceURL, resp.StatusCode)
	}

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, fmt.Errorf("read source image from %s: %w", sourceURL, err)
	}
	if len(payload) == 0 {
		return nil, errors.New("empty source image")
	}

	img, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("decode source image from %s: %w", sourceURL, err)
	}

	return img, nil
}

func (c *coverCache) sourceURL(sourcePath string) string {
	sourceURL := strings.TrimSpace(sourcePath)
	if strings.HasPrefix(sourceURL, "http://") || strings.HasPrefix(sourceURL, "https://") {
		return sourceURL
	}
	return fmt.Sprintf("%s/original/%s", c.imageBaseURL, strings.TrimLeft(sourceURL, "/"))
}

func (c *coverCache) variantPath(mediaID string, kind coverKind, size coverSize) string {
	mediaID = strings.TrimSpace(mediaID)
	prefixOne, prefixTwo := "xx", "xx"
	if len(mediaID) >= 2 {
		prefixOne = mediaID[:2]
	}
	if len(mediaID) >= 4 {
		prefixTwo = mediaID[2:4]
	}
	return filepath.Join(c.cacheDir, "covers", prefixOne, prefixTwo, mediaID, fmt.Sprintf("%s-%s.jpg", kind, size))
}

func (c *coverCache) lockFor(key string) *sync.Mutex {
	lock, _ := c.locks.LoadOrStore(key, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

func resizeToWidth(source image.Image, width int) image.Image {
	if width <= 0 {
		return source
	}

	bounds := source.Bounds()
	sourceWidth := bounds.Dx()
	sourceHeight := bounds.Dy()
	if sourceWidth <= 0 || sourceHeight <= 0 {
		return source
	}

	if width >= sourceWidth {
		return source
	}

	height := sourceHeight * width / sourceWidth
	if height <= 0 {
		height = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), source, bounds, xdraw.Over, nil)
	return dst
}

func writeJPEGAtomic(path string, imageData image.Image) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	tempFile, err := os.CreateTemp(filepath.Dir(path), ".cover-*.jpg")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()

	cleanup := func(cause error) error {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
		return cause
	}

	if err := jpeg.Encode(tempFile, imageData, &jpeg.Options{Quality: 84}); err != nil {
		return cleanup(err)
	}

	if err := tempFile.Close(); err != nil {
		return cleanup(err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return cleanup(err)
	}

	return nil
}

func fileExists(path string) bool {
	stat, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !stat.IsDir()
}

type coverCacheFile struct {
	path    string
	modTime time.Time
	size    int64
}

func (c *coverCache) cleanup(maxBytes int64) (int, int64, error) {
	c.cleanupMu.Lock()
	defer c.cleanupMu.Unlock()

	if maxBytes <= 0 {
		return 0, 0, nil
	}

	root := filepath.Join(c.cacheDir, "covers")
	files := make([]coverCacheFile, 0)
	var totalBytes int64
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if strings.HasPrefix(entry.Name(), ".cover-") || strings.ToLower(filepath.Ext(entry.Name())) != ".jpg" {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		files = append(files, coverCacheFile{path: path, modTime: info.ModTime(), size: info.Size()})
		totalBytes += info.Size()
		return nil
	})
	if err != nil {
		return 0, 0, fmt.Errorf("scan cover cache: %w", err)
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.Before(files[j].modTime)
	})

	removed := 0
	for _, file := range files {
		if totalBytes <= maxBytes {
			break
		}
		if err := os.Remove(file.path); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return removed, totalBytes, fmt.Errorf("remove cover cache file %s: %w", file.path, err)
		}
		totalBytes -= file.size
		removed++
	}

	_ = removeEmptyDirs(root)
	return removed, totalBytes, nil
}

func touchFile(path string) error {
	now := time.Now()
	return os.Chtimes(path, now, now)
}

func removeEmptyDirs(root string) error {
	var dirs []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path != root && entry.IsDir() {
			dirs = append(dirs, path)
		}
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	sort.Slice(dirs, func(i, j int) bool {
		return len(dirs[i]) > len(dirs[j])
	})
	for _, dir := range dirs {
		_ = os.Remove(dir)
	}
	return nil
}

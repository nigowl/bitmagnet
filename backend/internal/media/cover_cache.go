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
		return cachePath, nil
	}

	lockKey := fmt.Sprintf("%s:%s", mediaID, kind)
	lock := c.lockFor(lockKey)
	lock.Lock()
	defer lock.Unlock()

	if fileExists(cachePath) {
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

	return cachePath, nil
}

func (c *coverCache) writeAllVariants(mediaID string, kind coverKind, source image.Image) error {
	if err := os.MkdirAll(filepath.Join(c.cacheDir, mediaID), 0o755); err != nil {
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
	sourceURL := sourcePath
	if !strings.HasPrefix(sourceURL, "http://") && !strings.HasPrefix(sourceURL, "https://") {
		sourceURL = fmt.Sprintf("%s/original/%s", c.imageBaseURL, strings.TrimLeft(sourcePath, "/"))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download source image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrCoverNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download source image failed: status %d", resp.StatusCode)
	}

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, fmt.Errorf("read source image: %w", err)
	}
	if len(payload) == 0 {
		return nil, errors.New("empty source image")
	}

	img, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("decode source image: %w", err)
	}

	return img, nil
}

func (c *coverCache) variantPath(mediaID string, kind coverKind, size coverSize) string {
	return filepath.Join(c.cacheDir, mediaID, fmt.Sprintf("%s-%s.jpg", kind, size))
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

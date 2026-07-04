package mediaapi

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/media"
	"go.uber.org/zap"
)

const statusClientClosedRequest = 499

func ffmpegErrorMessage(stderrText string, fallback error) string {
	message := strings.TrimSpace(stderrText)
	if message == "" && fallback != nil {
		message = strings.TrimSpace(fallback.Error())
	}
	return message
}

func (b *builder) playerTransmissionStream(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	preferTranscode := strings.TrimSpace(c.Query("transcode")) == "1"
	audioTrackIndex := parseInt(c.Query("audioTrack"), -1)
	outputResolution := parseInt(c.Query("resolution"), 0)
	startSeconds := parseFloat(c.Query("start"), 0)
	startBytes := parseInt64(c.Query("startBytes"), 0)
	startedAt := time.Now()
	responseError := ""
	requestClosed := false
	resolveRangeHeader := c.GetHeader("Range")
	if preferTranscode {
		resolveRangeHeader = ""
		if startBytes > 0 {
			resolveRangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
		}
	}

	baseFields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("request_uri", c.Request.URL.RequestURI()),
		zap.String("query", c.Request.URL.RawQuery),
		zap.String("info_hash", infoHash),
		zap.Int("file_index", fileIndex),
		zap.Bool("prefer_transcode", preferTranscode),
		zap.Int("audio_track_index", audioTrackIndex),
		zap.Int("output_resolution", outputResolution),
		zap.Float64("start_seconds", startSeconds),
		zap.Int64("start_bytes", startBytes),
		zap.String("range", c.GetHeader("Range")),
		zap.String("resolve_range", resolveRangeHeader),
		zap.String("client_ip", c.ClientIP()),
		zap.String("user_agent", c.Request.UserAgent()),
	}
	defer func() {
		statusCode := c.Writer.Status()
		if statusCode <= 0 {
			statusCode = http.StatusOK
		}
		fields := append([]zap.Field{}, baseFields...)
		fields = append(
			fields,
			zap.Int("status", statusCode),
			zap.Duration("latency", time.Since(startedAt)),
			zap.String("stream_source", c.Writer.Header().Get("X-Bitmagnet-Stream-Source")),
			zap.String("stream_path", c.Writer.Header().Get("X-Bitmagnet-Stream-Path")),
		)
		if responseError != "" {
			fields = append(fields, zap.String("response_error", responseError))
		}
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("gin_errors", c.Errors.String()))
		}
		switch {
		case requestClosed || statusCode == statusClientClosedRequest:
			b.streamLogger.Debug("player stream request closed", fields...)
		case statusCode >= 500:
			b.streamLogger.Warn("player stream request failed", fields...)
		case statusCode >= 400:
			b.streamLogger.Info("player stream request rejected", fields...)
		case preferTranscode || strings.TrimSpace(c.Writer.Header().Get("X-Bitmagnet-Transcode")) != "":
			b.streamLogger.Info("player stream request", fields...)
		default:
			b.streamLogger.Debug("player stream request", fields...)
		}
	}()

	resolveResult, err := b.service.PlayerTransmissionResolveStream(c.Request.Context(), media.PlayerTransmissionResolveStreamInput{
		InfoHash:         infoHash,
		FileIndex:        fileIndex,
		RangeHeader:      resolveRangeHeader,
		PreferTranscode:  preferTranscode,
		AudioTrackIndex:  audioTrackIndex,
		OutputResolution: outputResolution,
		StartSeconds:     startSeconds,
		StartBytes:       startBytes,
	})
	if err != nil {
		responseError = err.Error()
		switch {
		case isBenignStreamingError(err):
			requestClosed = true
			c.Status(statusClientClosedRequest)
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerInvalidRange):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player disabled"})
		case errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": "player transmission disabled"})
		case errors.Is(err, media.ErrPlayerStreamUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "stream data not ready yet"})
		case errors.Is(err, media.ErrPlayerStorageUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if !preferTranscode {
		if !resolveResult.Completed {
			responseError = media.ErrPlayerStreamUnavailable.Error()
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "stream data not ready yet"})
			return
		}
		b.playerTransmissionStreamDirect(c, resolveResult)
		return
	}

	if !resolveResult.Transcode.Enabled {
		responseError = media.ErrPlayerTranscodeDisabled.Error()
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "player transcode disabled"})
		return
	}
	b.playerTransmissionStreamTranscoded(c, resolveResult)
}

func (b *builder) playerTransmissionStreamDirect(c *gin.Context, resolveResult media.PlayerTransmissionResolveStreamResult) {
	inputPath := strings.TrimSpace(resolveResult.FilePath)
	file, err := os.Open(inputPath)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		if err == nil {
			err = fmt.Errorf("stream path is not a file")
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Content-Type", resolveResult.ContentType)
	c.Header("Accept-Ranges", "bytes")
	c.Header("X-Bitmagnet-Stream-Source", "local")
	c.Header("X-Bitmagnet-Stream-Path", inputPath)
	http.ServeContent(c.Writer, c.Request, stat.Name(), stat.ModTime(), file)
}

func (b *builder) playerTransmissionStreamTranscoded(c *gin.Context, resolveResult media.PlayerTransmissionResolveStreamResult) {
	binaryPath := strings.TrimSpace(resolveResult.Transcode.BinaryPath)
	if binaryPath == "" {
		binaryPath = "ffmpeg"
	}
	inputPath := resolveResult.FilePath
	streamSource := "local+ffmpeg"
	streamPath := strings.TrimSpace(resolveResult.FilePath)
	transcodeStartSeconds := resolveResult.StartSeconds
	transcodeSeekStartBytes := resolveResult.StartBytes

	args := buildPlayerFFmpegArgs(
		inputPath,
		resolveResult.Transcode,
		transcodeStartSeconds,
		resolveResult.AudioTrackIndex,
		resolveResult.OutputResolution,
		!resolveResult.Completed,
	)
	cmd := exec.CommandContext(c.Request.Context(), binaryPath, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	c.Header("Cache-Control", "no-store, max-age=0")
	c.Header("Content-Type", "video/mp4")
	c.Header("Accept-Ranges", "none")
	c.Header("X-Bitmagnet-Transcode", "ffmpeg")
	c.Header("X-Bitmagnet-Transcode-Binary", binaryPath)
	c.Header("X-Bitmagnet-Transcode-Start", strconv.FormatFloat(transcodeStartSeconds, 'f', 3, 64))
	c.Header("X-Bitmagnet-Transcode-Seek-Bytes", strconv.FormatInt(transcodeSeekStartBytes, 10))
	c.Header("X-Bitmagnet-Transcode-Audio-Track", strconv.Itoa(resolveResult.AudioTrackIndex))
	c.Header("X-Bitmagnet-Transcode-Resolution", strconv.Itoa(resolveResult.OutputResolution))
	c.Header("X-Bitmagnet-Transcode-Realtime-Input", strconv.FormatBool(!resolveResult.Completed))
	c.Header("X-Bitmagnet-Stream-Source", streamSource)
	if streamPath != "" {
		c.Header("X-Bitmagnet-Stream-Path", streamPath)
	}
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}

	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer stdout.Close()

	reader := bufio.NewReaderSize(stdout, 64*1024)
	firstChunk := make([]byte, 32*1024)
	type firstReadResult struct {
		n   int
		err error
	}
	firstReadCh := make(chan firstReadResult, 1)
	go func() {
		n, err := reader.Read(firstChunk)
		firstReadCh <- firstReadResult{n: n, err: err}
	}()

	var firstRead firstReadResult
	firstChunkTimeout := 15 * time.Second
	if transcodeStartSeconds > 0 {
		firstChunkTimeout += 20 * time.Second
	}
	select {
	case firstRead = <-firstReadCh:
	case <-c.Request.Context().Done():
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		c.Status(statusClientClosedRequest)
		return
	case <-time.After(firstChunkTimeout):
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		message := ffmpegErrorMessage(stderr.String(), nil)
		if message == "" {
			message = fmt.Sprintf(
				"ffmpeg produced no output within %ds (source=%s,start=%.3fs,input=%s)",
				int(firstChunkTimeout.Seconds()),
				streamSource,
				transcodeStartSeconds,
				inputPath,
			)
		}
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": message})
		return
	}

	if firstRead.n <= 0 {
		if waitErr := cmd.Wait(); waitErr != nil {
			message := ffmpegErrorMessage(stderr.String(), waitErr)
			if isExpectedFFmpegExit(waitErr, c.Request.Context(), message) {
				return
			}
			if isTransientFFmpegStartupFailure(message) || isRetryableFFmpegFailure(message) {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", message)})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("ffmpeg stream failed: %s", message)})
			return
		}
		if firstRead.err != nil && !errors.Is(firstRead.err, io.EOF) {
			message := strings.TrimSpace(firstRead.err.Error())
			if isTransientFFmpegStartupFailure(message) || isRetryableFFmpegFailure(message) {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", message)})
				return
			}
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("ffmpeg startup pending: %s", firstRead.err.Error())})
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ffmpeg startup pending: empty output"})
		return
	}

	c.Status(http.StatusOK)
	if _, err := c.Writer.Write(firstChunk[:firstRead.n]); err != nil && !isBenignStreamingError(err) {
		c.Error(err)
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		return
	}
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}

	if firstRead.err != nil && !errors.Is(firstRead.err, io.EOF) && !isBenignStreamingError(firstRead.err) {
		c.Error(firstRead.err)
	}
	if firstRead.err == nil {
		if _, err := io.Copy(c.Writer, reader); err != nil && !errors.Is(err, io.EOF) && !isBenignStreamingError(err) {
			c.Error(err)
		}
	}
	if err := cmd.Wait(); err != nil {
		message := ffmpegErrorMessage(stderr.String(), err)
		if isExpectedFFmpegExit(err, c.Request.Context(), message) {
			return
		}
		c.Error(fmt.Errorf("ffmpeg stream failed: %s", message))
	}
}

func (b *builder) playerTransmissionThumbnail(c *gin.Context) {
	infoHash := strings.TrimSpace(c.Query("infoHash"))
	fileIndex := parseInt(c.Query("fileIndex"), -1)
	seconds := math.Max(0, parseFloat(c.Query("seconds"), 0))
	startBytes := parseInt64(c.Query("startBytes"), 0)
	if startBytes < 0 {
		startBytes = 0
	}

	rangeHeader := ""
	if startBytes > 0 {
		rangeHeader = fmt.Sprintf("bytes=%d-", startBytes)
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	resolveResult, err := b.service.PlayerTransmissionResolveStream(ctx, media.PlayerTransmissionResolveStreamInput{
		InfoHash:        infoHash,
		FileIndex:       fileIndex,
		RangeHeader:     rangeHeader,
		PreferTranscode: true,
		StartSeconds:    seconds,
		StartBytes:      startBytes,
	})
	if err != nil {
		switch {
		case errors.Is(err, media.ErrInvalidInfoHash), errors.Is(err, media.ErrPlayerInvalidRange):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerDisabled), errors.Is(err, media.ErrPlayerTransmissionDisabled):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrPlayerStreamUnavailable), errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
			c.JSON(http.StatusAccepted, gin.H{"error": "thumbnail source not ready"})
		case errors.Is(err, media.ErrPlayerStorageUnavailable):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrPlayerFileNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	if !resolveResult.Transcode.Enabled {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "player transcode disabled"})
		return
	}

	binaryPath := strings.TrimSpace(resolveResult.Transcode.BinaryPath)
	if binaryPath == "" {
		binaryPath = "ffmpeg"
	}
	args := buildPlayerFFmpegThumbnailArgs(resolveResult.FilePath, seconds)
	cmd := exec.CommandContext(ctx, binaryPath, args...)
	output, err := cmd.Output()
	if err != nil || len(output) == 0 {
		message := "thumbnail unavailable"
		if err != nil {
			message = err.Error()
		}
		c.JSON(http.StatusAccepted, gin.H{"error": message})
		return
	}

	c.Header("Cache-Control", "public, max-age=300")
	c.Header("Content-Type", "image/jpeg")
	c.Header("X-Bitmagnet-Thumbnail-Second", strconv.FormatFloat(seconds, 'f', 3, 64))
	c.Data(http.StatusOK, "image/jpeg", output)
}

func isBenignStreamingError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, net.ErrClosed) {
		return true
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "broken pipe") ||
		strings.Contains(message, "connection reset by peer") ||
		strings.Contains(message, "client disconnected")
}

func isExpectedFFmpegExit(waitErr error, requestCtx context.Context, stderrText string) bool {
	if waitErr == nil {
		return true
	}
	if errors.Is(waitErr, context.Canceled) || errors.Is(requestCtx.Err(), context.Canceled) {
		return true
	}
	message := normalizedFFmpegMessage(waitErr.Error())
	stderrNormalized := normalizedFFmpegMessage(stderrText)
	if strings.Contains(message, "signal: killed") {
		if stderrNormalized == "" ||
			strings.Contains(stderrNormalized, "broken pipe") ||
			strings.Contains(stderrNormalized, "connection reset by peer") {
			return true
		}
	}
	return false
}

func isTransientFFmpegStartupFailure(message string) bool {
	normalized := normalizedFFmpegMessage(message)
	if normalized == "" {
		return true
	}
	transientTokens := []string{
		"moov atom not found",
		"invalid data found when processing input",
		"error reading header",
		"could not find codec parameters",
		"could not find stream information",
		"cannot determine format of input stream",
		"end of file",
		"input/output error",
	}
	for _, token := range transientTokens {
		if strings.Contains(normalized, token) {
			return true
		}
	}
	return false
}

func isRetryableFFmpegFailure(message string) bool {
	normalized := normalizedFFmpegMessage(message)
	if normalized == "" {
		return true
	}
	nonRetryable := []string{
		"executable file not found",
		"unknown encoder",
		"option not found",
		"invalid argument",
		"permission denied",
	}
	for _, token := range nonRetryable {
		if strings.Contains(normalized, token) {
			return false
		}
	}
	return true
}

func normalizedFFmpegMessage(message string) string {
	return strings.ToLower(strings.TrimSpace(message))
}

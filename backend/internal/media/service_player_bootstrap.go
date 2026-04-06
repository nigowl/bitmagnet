package media

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

const defaultPlayerMetadataTimeoutSeconds = 25
const defaultPlayerHardTimeoutSeconds = 45
const defaultPlayerTransmissionRPCURL = "http://127.0.0.1:9091/transmission/rpc"
const defaultPlayerTransmissionTimeoutSeconds = 8
const defaultPlayerTransmissionSequentialDownload = true
const defaultPlayerTransmissionCleanupEnabled = false
const defaultPlayerTransmissionCleanupSlowTaskEnabled = true
const defaultPlayerTransmissionCleanupStorageEnabled = true
const defaultPlayerTransmissionCleanupMaxTasks = 60
const defaultPlayerTransmissionCleanupMinFreeSpaceGB = 20
const defaultPlayerTransmissionCleanupSlowWindowMinutes = 30
const defaultPlayerTransmissionCleanupSlowRateKbps = 64
const defaultPlayerTransmissionCleanupDeleteData = true
const defaultPlayerFFmpegBinaryPath = "ffmpeg"
const defaultPlayerFFmpegPreset = "veryfast"
const defaultPlayerFFmpegCRF = 23
const defaultPlayerFFmpegAudioBitrateKbps = 128
const defaultPlayerFFmpegThreads = 0
const defaultPlayerFFmpegForceTranscodeExtensions = ".mkv,.avi,.flv,.wmv,.rm,.rmvb,.ts,.m2ts,.mpeg,.mpg,.vob,.mxf,.divx,.xvid,.3gp,.3g2,.f4v"
const transmissionSessionHeader = "X-Transmission-Session-Id"

type playerBootstrapSettings struct {
	MetadataTimeoutSeconds               int
	HardTimeoutSeconds                   int
	TransmissionEnabled                  bool
	TransmissionURL                      string
	TransmissionLocalDownloadDir         string
	TransmissionUsername                 string
	TransmissionPassword                 string
	TransmissionInsecureTLS              bool
	TransmissionTimeoutSeconds           int
	TransmissionSequential               bool
	TransmissionCleanupEnabled           bool
	TransmissionCleanupSlowTaskEnabled   bool
	TransmissionCleanupStorageEnabled    bool
	TransmissionCleanupMaxTasks          int
	TransmissionCleanupMinFreeSpaceGB    int
	TransmissionCleanupSlowWindowMinutes int
	TransmissionCleanupSlowRateKbps      int
	TransmissionCleanupDeleteData        bool
	FFmpeg                               PlayerFFmpegTranscodeSettings
}

func (s *service) loadPlayerBootstrapSettings(ctx context.Context, db *gorm.DB) (playerBootstrapSettings, error) {
	values, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.PlayerKeys())
	if err != nil {
		return playerBootstrapSettings{}, err
	}

	settings := playerBootstrapSettings{
		MetadataTimeoutSeconds:               defaultPlayerMetadataTimeoutSeconds,
		HardTimeoutSeconds:                   defaultPlayerHardTimeoutSeconds,
		TransmissionEnabled:                  false,
		TransmissionURL:                      defaultPlayerTransmissionRPCURL,
		TransmissionLocalDownloadDir:         "",
		TransmissionUsername:                 "",
		TransmissionPassword:                 "",
		TransmissionInsecureTLS:              false,
		TransmissionTimeoutSeconds:           defaultPlayerTransmissionTimeoutSeconds,
		TransmissionSequential:               defaultPlayerTransmissionSequentialDownload,
		TransmissionCleanupEnabled:           defaultPlayerTransmissionCleanupEnabled,
		TransmissionCleanupSlowTaskEnabled:   defaultPlayerTransmissionCleanupSlowTaskEnabled,
		TransmissionCleanupStorageEnabled:    defaultPlayerTransmissionCleanupStorageEnabled,
		TransmissionCleanupMaxTasks:          defaultPlayerTransmissionCleanupMaxTasks,
		TransmissionCleanupMinFreeSpaceGB:    defaultPlayerTransmissionCleanupMinFreeSpaceGB,
		TransmissionCleanupSlowWindowMinutes: defaultPlayerTransmissionCleanupSlowWindowMinutes,
		TransmissionCleanupSlowRateKbps:      defaultPlayerTransmissionCleanupSlowRateKbps,
		TransmissionCleanupDeleteData:        defaultPlayerTransmissionCleanupDeleteData,
		FFmpeg: PlayerFFmpegTranscodeSettings{
			Enabled:                  false,
			BinaryPath:               defaultPlayerFFmpegBinaryPath,
			Preset:                   defaultPlayerFFmpegPreset,
			CRF:                      defaultPlayerFFmpegCRF,
			AudioBitrateKbps:         defaultPlayerFFmpegAudioBitrateKbps,
			Threads:                  defaultPlayerFFmpegThreads,
			ExtraArgs:                "",
			ForceTranscodeExtensions: parsePlayerFFmpegExtensionList(defaultPlayerFFmpegForceTranscodeExtensions),
		},
	}

	if raw, ok := values[runtimeconfig.KeyPlayerMetadataTimeoutSeconds]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 5 && parsed <= 300 {
			settings.MetadataTimeoutSeconds = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerHardTimeoutSeconds]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 10 && parsed <= 900 {
			settings.HardTimeoutSeconds = parsed
		}
	}
	if settings.HardTimeoutSeconds < settings.MetadataTimeoutSeconds {
		settings.HardTimeoutSeconds = settings.MetadataTimeoutSeconds
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionURL]; ok {
		if trimmed := strings.TrimSpace(raw); trimmed != "" {
			settings.TransmissionURL = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir]; ok {
		settings.TransmissionLocalDownloadDir = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionUsername]; ok {
		settings.TransmissionUsername = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionPassword]; ok {
		settings.TransmissionPassword = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionInsecure]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionInsecureTLS = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionTimeoutSec]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 2 && parsed <= 60 {
			settings.TransmissionTimeoutSeconds = parsed
		}
	}
	if settings.TransmissionLocalDownloadDir == "" {
		if raw, ok := values[runtimeconfig.KeyPlayerTransmissionLocalDownloadDir]; ok {
			settings.TransmissionLocalDownloadDir = strings.TrimSpace(raw)
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionSequential]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionSequential = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionCleanupEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupSlowTaskEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionCleanupSlowTaskEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupStorageEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionCleanupStorageEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupDeleteData]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.TransmissionCleanupDeleteData = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupMaxTasks]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 0 && parsed <= 5000 {
			settings.TransmissionCleanupMaxTasks = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupMinFreeSpaceGB]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 0 && parsed <= 8192 {
			settings.TransmissionCleanupMinFreeSpaceGB = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupSlowWindowMinutes]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 5 && parsed <= 1440 {
			settings.TransmissionCleanupSlowWindowMinutes = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerTransmissionCleanupSlowRateKbps]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 0 && parsed <= 102400 {
			settings.TransmissionCleanupSlowRateKbps = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			settings.FFmpeg.Enabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegBinaryPath]; ok {
		if trimmed := strings.TrimSpace(raw); trimmed != "" {
			settings.FFmpeg.BinaryPath = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegPreset]; ok {
		if trimmed := strings.TrimSpace(raw); trimmed != "" {
			settings.FFmpeg.Preset = trimmed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegCRF]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 16 && parsed <= 38 {
			settings.FFmpeg.CRF = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegAudioBitrateKbps]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 64 && parsed <= 320 {
			settings.FFmpeg.AudioBitrateKbps = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegThreads]; ok {
		if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 0 && parsed <= 32 {
			settings.FFmpeg.Threads = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegExtraArgs]; ok {
		settings.FFmpeg.ExtraArgs = strings.TrimSpace(raw)
	}
	if raw, ok := values[runtimeconfig.KeyPlayerFFmpegForceTranscodeExtensions]; ok {
		if extensions := parsePlayerFFmpegExtensionList(raw); len(extensions) > 0 {
			settings.FFmpeg.ForceTranscodeExtensions = extensions
		}
	}

	return settings, nil
}

func parsePlayerFFmpegExtensionList(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	parts := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ';'
	})
	if len(parts) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(parts))
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.ToLower(strings.TrimSpace(part))
		item = strings.TrimPrefix(item, "*")
		if item == "" {
			continue
		}
		if !strings.HasPrefix(item, ".") {
			item = "." + item
		}
		valid := true
		for _, ch := range item {
			if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-' {
				continue
			}
			valid = false
			break
		}
		if !valid || len(item) < 2 || len(item) > 16 {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		normalized = append(normalized, item)
	}
	return normalized
}

func callTransmissionRPC(
	ctx context.Context,
	endpoint string,
	username string,
	password string,
	insecureTLS bool,
	timeoutSeconds int,
	payload []byte,
) ([]byte, error) {
	if timeoutSeconds < 2 || timeoutSeconds > 60 {
		timeoutSeconds = defaultPlayerTransmissionTimeoutSeconds
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	if insecureTLS {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	client := &http.Client{
		Timeout:   time.Duration(timeoutSeconds) * time.Second,
		Transport: transport,
	}

	sessionID := ""
	for attempt := 0; attempt < 2; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		if sessionID != "" {
			request.Header.Set(transmissionSessionHeader, sessionID)
		}
		if username != "" || password != "" {
			request.SetBasicAuth(username, password)
		}

		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		responseBytes, readErr := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
		_ = response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}

		if response.StatusCode == http.StatusConflict {
			nextSessionID := strings.TrimSpace(response.Header.Get(transmissionSessionHeader))
			if nextSessionID == "" {
				return nil, errors.New("transmission rpc returned 409 without session id")
			}
			sessionID = nextSessionID
			continue
		}

		if response.StatusCode < 200 || response.StatusCode >= 300 {
			message := strings.TrimSpace(string(responseBytes))
			if message == "" {
				message = response.Status
			}
			return nil, errors.New("transmission rpc failed (" + strconv.Itoa(response.StatusCode) + "): " + message)
		}

		return responseBytes, nil
	}

	return nil, errors.New("transmission rpc session negotiation exceeded retry limit")
}

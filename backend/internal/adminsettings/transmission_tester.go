package adminsettings

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const transmissionRPCSessionHeader = "X-Transmission-Session-Id"

type TransmissionTestInput struct {
	URL                      string `json:"url"`
	LocalDownloadDir         string `json:"localDownloadDir"`
	DownloadMappingDirectory string `json:"downloadMappingDirectory"`
	Username                 string `json:"username"`
	Password                 string `json:"password"`
	InsecureTLS              bool   `json:"insecureTls"`
	TimeoutSeconds           int    `json:"timeoutSeconds"`
}

type DownloadMappingTestInput struct {
	Directory      string `json:"directory"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
}

type DownloadMappingTestResult struct {
	Success           bool   `json:"success"`
	Message           string `json:"message"`
	Mode              string `json:"mode"`
	LatencyMs         int64  `json:"latencyMs"`
	Directory         string `json:"directory"`
	DirectoryExists   bool   `json:"directoryExists"`
	DirectoryIsDir    bool   `json:"directoryIsDir"`
	DirectoryReadable bool   `json:"directoryReadable"`
	DirectoryEntries  int    `json:"directoryEntries"`
	DirectoryError    string `json:"directoryError"`
}

type TransmissionTestResult struct {
	Success                  bool                      `json:"success"`
	Message                  string                    `json:"message"`
	URL                      string                    `json:"url"`
	LatencyMs                int64                     `json:"latencyMs"`
	RPCVersion               int                       `json:"rpcVersion"`
	RPCVersionMin            int                       `json:"rpcVersionMin"`
	Version                  string                    `json:"version"`
	DownloadDir              string                    `json:"downloadDir"`
	DownloadMapping          DownloadMappingTestResult `json:"downloadMapping"`
	LocalDownloadDir         string                    `json:"localDownloadDir"`
	LocalDownloadDirExists   bool                      `json:"localDownloadDirExists"`
	LocalDownloadDirIsDir    bool                      `json:"localDownloadDirIsDir"`
	LocalDownloadDirReadable bool                      `json:"localDownloadDirReadable"`
	LocalDownloadDirEntries  int                       `json:"localDownloadDirEntries"`
	LocalDownloadDirError    string                    `json:"localDownloadDirError"`
}

type transmissionSessionGetRequest struct {
	Method string `json:"method"`
}

type transmissionSessionGetResponse struct {
	Result    string                        `json:"result"`
	Arguments transmissionSessionGetPayload `json:"arguments"`
}

type transmissionSessionGetPayload struct {
	Version          string `json:"version"`
	RPCVersion       int    `json:"rpc-version"`
	RPCVersionMin    int    `json:"rpc-version-minimum"`
	DownloadDir      string `json:"download-dir"`
	PeerPort         int    `json:"peer-port"`
	PeerPortRandomOn bool   `json:"peer-port-random-on-start"`
}

func (s *service) TestPlayerTransmission(ctx context.Context, input TransmissionTestInput) (TransmissionTestResult, error) {
	url := strings.TrimSpace(input.URL)
	if url == "" {
		url = strings.TrimSpace(s.defaults.Player.Transmission.URL)
	}
	if url == "" {
		return TransmissionTestResult{}, fmt.Errorf("%w: player.transmission.url", ErrInvalidInput)
	}

	timeoutSeconds := input.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = s.defaults.Player.Transmission.TimeoutSeconds
	}
	if timeoutSeconds < 2 || timeoutSeconds > 60 {
		return TransmissionTestResult{}, fmt.Errorf("%w: player.transmission.timeoutSeconds", ErrInvalidInput)
	}

	mappingDirectory := strings.TrimSpace(input.DownloadMappingDirectory)
	if mappingDirectory == "" {
		mappingDirectory = strings.TrimSpace(input.LocalDownloadDir)
	}
	if mappingDirectory == "" {
		mappingDirectory = strings.TrimSpace(s.defaults.Player.Transmission.DownloadMappingDirectory)
	}
	if mappingDirectory == "" {
		mappingDirectory = strings.TrimSpace(s.defaults.Player.Transmission.LocalDownloadDir)
	}

	mappingResult, _ := s.TestPlayerDownloadMapping(ctx, DownloadMappingTestInput{
		Directory:      mappingDirectory,
		TimeoutSeconds: timeoutSeconds,
	})

	payload, err := json.Marshal(transmissionSessionGetRequest{Method: "session-get"})
	if err != nil {
		return TransmissionTestResult{}, err
	}

	startedAt := time.Now()
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		url,
		strings.TrimSpace(input.Username),
		strings.TrimSpace(input.Password),
		input.InsecureTLS,
		timeoutSeconds,
		payload,
	)
	if err != nil {
		return TransmissionTestResult{
			Success:                  false,
			Message:                  err.Error(),
			URL:                      url,
			LatencyMs:                time.Since(startedAt).Milliseconds(),
			DownloadMapping:          mappingResult,
			LocalDownloadDir:         mappingResult.Directory,
			LocalDownloadDirExists:   mappingResult.DirectoryExists,
			LocalDownloadDirIsDir:    mappingResult.DirectoryIsDir,
			LocalDownloadDirReadable: mappingResult.DirectoryReadable,
			LocalDownloadDirEntries:  mappingResult.DirectoryEntries,
			LocalDownloadDirError:    mappingResult.DirectoryError,
		}, nil
	}

	var parsed transmissionSessionGetResponse
	if err := json.Unmarshal(responseBytes, &parsed); err != nil {
		return TransmissionTestResult{
			Success:                  false,
			Message:                  fmt.Sprintf("parse rpc response failed: %v", err),
			URL:                      url,
			LatencyMs:                time.Since(startedAt).Milliseconds(),
			DownloadMapping:          mappingResult,
			LocalDownloadDir:         mappingResult.Directory,
			LocalDownloadDirExists:   mappingResult.DirectoryExists,
			LocalDownloadDirIsDir:    mappingResult.DirectoryIsDir,
			LocalDownloadDirReadable: mappingResult.DirectoryReadable,
			LocalDownloadDirEntries:  mappingResult.DirectoryEntries,
			LocalDownloadDirError:    mappingResult.DirectoryError,
		}, nil
	}

	if !strings.EqualFold(strings.TrimSpace(parsed.Result), "success") {
		return TransmissionTestResult{
			Success:                  false,
			Message:                  fmt.Sprintf("rpc result=%q", strings.TrimSpace(parsed.Result)),
			URL:                      url,
			LatencyMs:                time.Since(startedAt).Milliseconds(),
			DownloadMapping:          mappingResult,
			LocalDownloadDir:         mappingResult.Directory,
			LocalDownloadDirExists:   mappingResult.DirectoryExists,
			LocalDownloadDirIsDir:    mappingResult.DirectoryIsDir,
			LocalDownloadDirReadable: mappingResult.DirectoryReadable,
			LocalDownloadDirEntries:  mappingResult.DirectoryEntries,
			LocalDownloadDirError:    mappingResult.DirectoryError,
		}, nil
	}

	return TransmissionTestResult{
		Success:                  true,
		Message:                  "connection ok",
		URL:                      url,
		LatencyMs:                time.Since(startedAt).Milliseconds(),
		RPCVersion:               parsed.Arguments.RPCVersion,
		RPCVersionMin:            parsed.Arguments.RPCVersionMin,
		Version:                  strings.TrimSpace(parsed.Arguments.Version),
		DownloadDir:              strings.TrimSpace(parsed.Arguments.DownloadDir),
		DownloadMapping:          mappingResult,
		LocalDownloadDir:         mappingResult.Directory,
		LocalDownloadDirExists:   mappingResult.DirectoryExists,
		LocalDownloadDirIsDir:    mappingResult.DirectoryIsDir,
		LocalDownloadDirReadable: mappingResult.DirectoryReadable,
		LocalDownloadDirEntries:  mappingResult.DirectoryEntries,
		LocalDownloadDirError:    mappingResult.DirectoryError,
	}, nil
}

func (s *service) TestPlayerDownloadMapping(ctx context.Context, input DownloadMappingTestInput) (DownloadMappingTestResult, error) {
	_ = ctx
	timeoutSeconds := input.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = s.defaults.Player.Transmission.TimeoutSeconds
	}
	if timeoutSeconds < 2 || timeoutSeconds > 60 {
		return DownloadMappingTestResult{}, fmt.Errorf("%w: player.transmission.timeoutSeconds", ErrInvalidInput)
	}
	return testDownloadMappingDirectory(strings.TrimSpace(input.Directory)), nil
}

type localDirProbeResult struct {
	Path     string
	Exists   bool
	IsDir    bool
	Readable bool
	Entries  int
	Error    string
}

func probeLocalDownloadDir(path string) localDirProbeResult {
	probe := localDirProbeResult{Path: strings.TrimSpace(path)}
	if probe.Path == "" {
		return probe
	}
	info, err := os.Stat(probe.Path)
	if err != nil {
		probe.Error = err.Error()
		return probe
	}
	probe.Exists = true
	probe.IsDir = info.IsDir()
	if !probe.IsDir {
		probe.Error = "path is not a directory"
		return probe
	}
	entries, readErr := os.ReadDir(probe.Path)
	if readErr != nil {
		probe.Error = readErr.Error()
		return probe
	}
	probe.Readable = true
	probe.Entries = len(entries)
	return probe
}

func testDownloadMappingDirectory(path string) DownloadMappingTestResult {
	probe := probeLocalDownloadDir(path)
	result := DownloadMappingTestResult{
		Mode:              downloadMappingModeDirectory,
		Directory:         probe.Path,
		DirectoryExists:   probe.Exists,
		DirectoryIsDir:    probe.IsDir,
		DirectoryReadable: probe.Readable,
		DirectoryEntries:  probe.Entries,
		DirectoryError:    probe.Error,
	}
	if strings.TrimSpace(probe.Path) == "" {
		result.Success = false
		result.Message = "directory path is empty"
		return result
	}
	if probe.Exists && probe.IsDir && probe.Readable {
		result.Success = true
		result.Message = "directory mapping ok"
		return result
	}
	result.Success = false
	if strings.TrimSpace(probe.Error) == "" {
		result.Message = "directory mapping unavailable"
	} else {
		result.Message = probe.Error
	}
	return result
}

func callTransmissionRPCWithSession(
	ctx context.Context,
	url string,
	username string,
	password string,
	insecureTLS bool,
	timeoutSeconds int,
	payload []byte,
) ([]byte, error) {
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
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		if sessionID != "" {
			request.Header.Set(transmissionRPCSessionHeader, sessionID)
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
			nextSessionID := strings.TrimSpace(response.Header.Get(transmissionRPCSessionHeader))
			if nextSessionID == "" {
				return nil, fmt.Errorf("rpc 409 without %s", transmissionRPCSessionHeader)
			}
			sessionID = nextSessionID
			continue
		}

		if response.StatusCode < 200 || response.StatusCode >= 300 {
			message := strings.TrimSpace(string(responseBytes))
			if message == "" {
				message = response.Status
			}
			return nil, fmt.Errorf("rpc failed (%d): %s", response.StatusCode, message)
		}

		return responseBytes, nil
	}

	return nil, fmt.Errorf("rpc session retry exhausted")
}

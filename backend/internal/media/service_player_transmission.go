package media

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"mime"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
)

const defaultPlayerStreamProbeChunkBytes int64 = 16 * 1024 * 1024
const defaultPlayerStreamMaxRangeBytes int64 = 64 * 1024 * 1024
const defaultPlayerStreamPollInterval = 700 * time.Millisecond

var playerVideoExtensions = []string{
	".mp4", ".m4v", ".webm", ".mkv", ".mov", ".avi", ".flv", ".ts", ".m2ts", ".mpeg", ".mpg",
	".wmv", ".asf", ".3gp", ".3g2", ".f4v", ".rm", ".rmvb", ".vob", ".mxf", ".divx", ".xvid",
}

type playerTransmissionRPCRequest struct {
	Method    string                         `json:"method"`
	Arguments playerTransmissionRPCArguments `json:"arguments,omitempty"`
}

type playerTransmissionRPCArguments struct {
	IDs             []any    `json:"ids,omitempty"`
	Fields          []string `json:"fields,omitempty"`
	Filename        string   `json:"filename,omitempty"`
	Paused          *bool    `json:"paused,omitempty"`
	FilesWanted     []int    `json:"files-wanted,omitempty"`
	FilesUnwanted   []int    `json:"files-unwanted,omitempty"`
	PriorityHigh    []int    `json:"priority-high,omitempty"`
	PriorityLow     []int    `json:"priority-low,omitempty"`
	PriorityNormal  []int    `json:"priority-normal,omitempty"`
	Sequential      *bool    `json:"sequential_download,omitempty"`
	DeleteLocalData *bool    `json:"delete-local-data,omitempty"`
}

type playerTransmissionRPCResponse struct {
	Result    string                            `json:"result"`
	Arguments playerTransmissionRPCResponseArgs `json:"arguments"`
}

type playerTransmissionRPCResponseArgs struct {
	Torrents         []playerTransmissionRPCTorrent `json:"torrents"`
	TorrentAdded     *playerTransmissionRPCAddItem  `json:"torrent-added"`
	TorrentDuplicate *playerTransmissionRPCAddItem  `json:"torrent-duplicate"`
}

type playerTransmissionRPCAddItem struct {
	ID         int64  `json:"id"`
	HashString string `json:"hashString"`
	Name       string `json:"name"`
}

type playerTransmissionRPCTorrent struct {
	ID             int64                           `json:"id"`
	HashString     string                          `json:"hashString"`
	Name           string                          `json:"name"`
	Status         int                             `json:"status"`
	PercentDone    float64                         `json:"percentDone"`
	RateDownload   int64                           `json:"rateDownload"`
	RateUpload     int64                           `json:"rateUpload"`
	PeersConnected int                             `json:"peersConnected"`
	Error          int                             `json:"error"`
	ErrorString    string                          `json:"errorString"`
	LeftUntilDone  int64                           `json:"leftUntilDone"`
	SizeWhenDone   int64                           `json:"sizeWhenDone"`
	AddedDate      int64                           `json:"addedDate"`
	ActivityDate   int64                           `json:"activityDate"`
	IsFinished     bool                            `json:"isFinished"`
	DownloadDir    string                          `json:"downloadDir"`
	PieceSize      int64                           `json:"pieceSize"`
	Pieces         string                          `json:"pieces"`
	Files          []playerTransmissionRPCFile     `json:"files"`
	FileStats      []playerTransmissionRPCFileStat `json:"fileStats"`
	Sequential     bool                            `json:"sequential_download"`
}

type playerTransmissionRPCSessionResponse struct {
	Result    string                                   `json:"result"`
	Arguments playerTransmissionRPCSessionResponseArgs `json:"arguments"`
}

type playerTransmissionRPCSessionResponseArgs struct {
	DownloadDirFreeSpace int64  `json:"download-dir-free-space"`
	DownloadDir          string `json:"download-dir"`
	IncompleteDir        string `json:"incomplete-dir"`
	IncompleteDirEnabled bool   `json:"incomplete-dir-enabled"`
}

type playerTransmissionRPCFile struct {
	Name   string `json:"name"`
	Length int64  `json:"length"`
}

type playerTransmissionRPCFileStat struct {
	BytesCompleted int64 `json:"bytesCompleted"`
	Wanted         bool  `json:"wanted"`
	Priority       int   `json:"priority"`
}

func (s *service) PlayerTransmissionBootstrap(
	ctx context.Context,
	input PlayerTransmissionBootstrapInput,
) (PlayerTransmissionBootstrapResult, error) {
	infoHash, _, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionBootstrapResult{}, err
	}
	_ = s.playerTransmissionAutoCleanup(ctx, settings, infoHash)

	snapshot, err := s.playerTransmissionEnsureTorrent(ctx, settings, infoHash, torrent.MagnetURI())
	if err != nil {
		return PlayerTransmissionBootstrapResult{}, err
	}
	if len(snapshot.Files) == 0 {
		return PlayerTransmissionBootstrapResult{}, ErrPlayerFileNotFound
	}

	selected := playerTransmissionDefaultFileIndex(snapshot.Files, settings.TransmissionDownloadVideoFormats)
	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, selected, snapshot.Files); err != nil {
		return PlayerTransmissionBootstrapResult{}, err
	}
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	status, err := s.playerTransmissionLoadStatus(ctx, settings, infoHash, true)
	if err != nil {
		return PlayerTransmissionBootstrapResult{}, err
	}

	return PlayerTransmissionBootstrapResult{
		InfoHash:          infoHash,
		TorrentID:         status.TorrentID,
		SelectedFileIndex: status.SelectedFileIndex,
		StreamURL:         playerTransmissionBuildStreamURL(infoHash, status.SelectedFileIndex),
		TranscodeEnabled:  true,
		Status:            status,
	}, nil
}

func (s *service) PlayerTransmissionSelectFile(
	ctx context.Context,
	input PlayerTransmissionSelectFileInput,
) (PlayerTransmissionSelectFileResult, error) {
	infoHash, _, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionSelectFileResult{}, err
	}

	snapshot, err := s.playerTransmissionEnsureTorrent(ctx, settings, infoHash, torrent.MagnetURI())
	if err != nil {
		return PlayerTransmissionSelectFileResult{}, err
	}
	if input.FileIndex < 0 || input.FileIndex >= len(snapshot.Files) {
		return PlayerTransmissionSelectFileResult{}, ErrPlayerFileNotFound
	}

	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, input.FileIndex, snapshot.Files); err != nil {
		return PlayerTransmissionSelectFileResult{}, err
	}
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	status, err := s.playerTransmissionLoadStatus(ctx, settings, infoHash, true)
	if err != nil {
		return PlayerTransmissionSelectFileResult{}, err
	}

	return PlayerTransmissionSelectFileResult{
		InfoHash:          infoHash,
		SelectedFileIndex: status.SelectedFileIndex,
		StreamURL:         playerTransmissionBuildStreamURL(infoHash, status.SelectedFileIndex),
		TranscodeEnabled:  true,
		Status:            status,
	}, nil
}

func (s *service) PlayerTransmissionAudioTracks(
	ctx context.Context,
	input PlayerTransmissionAudioTracksInput,
) (PlayerTransmissionAudioTracksResult, error) {
	if input.FileIndex < 0 {
		return PlayerTransmissionAudioTracksResult{}, ErrPlayerFileNotFound
	}
	_, _, _, _, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionAudioTracksResult{}, err
	}

	resolveResult, err := s.PlayerTransmissionResolveStream(ctx, PlayerTransmissionResolveStreamInput{
		InfoHash:        input.InfoHash,
		FileIndex:       input.FileIndex,
		PreferTranscode: true,
		AudioTrackIndex: -1,
	})
	if err != nil {
		return PlayerTransmissionAudioTracksResult{}, err
	}
	tracks, err := playerTransmissionProbeAudioTracks(ctx, resolveResult.Transcode.BinaryPath, resolveResult.FilePath)
	if err != nil {
		return PlayerTransmissionAudioTracksResult{}, err
	}
	return PlayerTransmissionAudioTracksResult{
		InfoHash:  strings.TrimSpace(strings.ToLower(input.InfoHash)),
		FileIndex: input.FileIndex,
		Tracks:    tracks,
	}, nil
}

func (s *service) PlayerTransmissionStatus(
	ctx context.Context,
	input PlayerTransmissionStatusInput,
) (PlayerTransmissionStatusResult, error) {
	infoHash, _, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	if _, err := s.playerTransmissionEnsureTorrent(ctx, settings, infoHash, torrent.MagnetURI()); err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	return s.playerTransmissionLoadStatus(ctx, settings, infoHash, true)
}

func (s *service) PlayerTransmissionBatchStatus(
	ctx context.Context,
	input PlayerTransmissionBatchStatusInput,
) (PlayerTransmissionBatchStatusResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return PlayerTransmissionBatchStatusResult{}, err
	}
	db := q.Torrent.WithContext(ctx).UnderlyingDB()
	settings, err := s.loadPlayerBootstrapSettings(ctx, db)
	if err != nil {
		return PlayerTransmissionBatchStatusResult{}, err
	}
	if !settings.PlayerEnabled {
		return PlayerTransmissionBatchStatusResult{}, ErrPlayerDisabled
	}
	if !settings.TransmissionEnabled {
		return PlayerTransmissionBatchStatusResult{}, ErrPlayerTransmissionDisabled
	}

	infoHashes := make([]string, 0, len(input.InfoHashes))
	seen := make(map[string]struct{}, len(input.InfoHashes))
	for _, raw := range input.InfoHashes {
		infoHash := strings.TrimSpace(strings.ToLower(raw))
		if infoHash == "" {
			continue
		}
		if _, parseErr := protocol.ParseID(infoHash); parseErr != nil {
			continue
		}
		if _, ok := seen[infoHash]; ok {
			continue
		}
		seen[infoHash] = struct{}{}
		infoHashes = append(infoHashes, infoHash)
	}
	if len(infoHashes) == 0 {
		return PlayerTransmissionBatchStatusResult{Items: []PlayerTransmissionTaskStatus{}}, nil
	}

	snapshots, err := s.playerTransmissionFetchTorrents(ctx, settings, infoHashes)
	if err != nil {
		return PlayerTransmissionBatchStatusResult{}, err
	}

	items := make([]PlayerTransmissionTaskStatus, 0, len(infoHashes))
	for _, infoHash := range infoHashes {
		snapshot, ok := snapshots[infoHash]
		if !ok {
			items = append(items, PlayerTransmissionTaskStatus{
				InfoHash: infoHash,
				Exists:   false,
				State:    "missing",
				Progress: 0,
			})
			continue
		}
		items = append(items, PlayerTransmissionTaskStatus{
			InfoHash:  infoHash,
			Exists:    true,
			TorrentID: snapshot.ID,
			State:     playerTransmissionStatusLabel(snapshot.Status),
			Progress:  clampRatio(snapshot.PercentDone),
		})
	}

	return PlayerTransmissionBatchStatusResult{Items: items}, nil
}

func (s *service) PlayerTransmissionResolveStream(
	ctx context.Context,
	input PlayerTransmissionResolveStreamInput,
) (PlayerTransmissionResolveStreamResult, error) {
	infoHash, _, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionResolveStreamResult{}, err
	}

	if input.FileIndex < 0 {
		return PlayerTransmissionResolveStreamResult{}, ErrPlayerFileNotFound
	}
	if input.StartSeconds < 0 || math.IsNaN(input.StartSeconds) || math.IsInf(input.StartSeconds, 0) {
		input.StartSeconds = 0
	}
	if input.StartBytes < 0 {
		input.StartBytes = 0
	}
	if input.AudioTrackIndex < 0 {
		input.AudioTrackIndex = -1
	}
	input.OutputResolution = normalizePlayerOutputResolution(input.OutputResolution)

	snapshot, err := s.playerTransmissionEnsureTorrent(ctx, settings, infoHash, torrent.MagnetURI())
	if err != nil {
		return PlayerTransmissionResolveStreamResult{}, err
	}
	if input.FileIndex >= len(snapshot.Files) {
		return PlayerTransmissionResolveStreamResult{}, ErrPlayerFileNotFound
	}

	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, input.FileIndex, snapshot.Files); err != nil {
		return PlayerTransmissionResolveStreamResult{}, err
	}
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	fileLength := snapshot.Files[input.FileIndex].Length
	if fileLength > 0 && input.StartBytes >= fileLength {
		input.StartBytes = fileLength - 1
	}
	rangeStart, rangeEnd, partial, err := parsePlayerByteRange(input.RangeHeader, fileLength)
	if err != nil {
		return PlayerTransmissionResolveStreamResult{}, err
	}

	waitSeconds := settings.HardTimeoutSeconds
	if waitSeconds <= 0 {
		waitSeconds = defaultPlayerHardTimeoutSeconds
	}
	if waitSeconds > 180 {
		waitSeconds = 180
	}
	deadline := time.Now().Add(time.Duration(waitSeconds) * time.Second)

	var readySnapshot *playerTransmissionRPCTorrent
	for {
		current, loadErr := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, true)
		if loadErr != nil {
			return PlayerTransmissionResolveStreamResult{}, loadErr
		}
		if input.FileIndex >= len(current.Files) {
			return PlayerTransmissionResolveStreamResult{}, ErrPlayerFileNotFound
		}
		if playerTransmissionRangeAvailable(current, input.FileIndex, rangeStart, rangeEnd) {
			readySnapshot = current
			break
		}
		if time.Now().After(deadline) {
			return PlayerTransmissionResolveStreamResult{}, ErrPlayerStreamUnavailable
		}
		time.Sleep(defaultPlayerStreamPollInterval)
	}
	if playerTransmissionFileFullyCompleted(readySnapshot, input.FileIndex) {
		fullStart, fullEnd, fullPartial, rangeErr := parsePlayerByteRangeForCompletedFile(input.RangeHeader, fileLength)
		if rangeErr != nil {
			return PlayerTransmissionResolveStreamResult{}, rangeErr
		}
		rangeStart = fullStart
		rangeEnd = fullEnd
		partial = fullPartial
	}

	dirCandidates := []string{strings.TrimSpace(readySnapshot.DownloadDir)}
	if sessionDirs, sessionErr := s.playerTransmissionLoadSessionDirs(ctx, settings); sessionErr == nil {
		for _, sessionDir := range sessionDirs {
			trimmed := strings.TrimSpace(sessionDir)
			if trimmed == "" || strings.EqualFold(trimmed, strings.TrimSpace(readySnapshot.DownloadDir)) {
				continue
			}
			dirCandidates = append(dirCandidates, trimmed)
		}
	}

	fileName := strings.TrimSpace(readySnapshot.Files[input.FileIndex].Name)

	targetPath := ""
	var resolveErr error
	for _, dir := range dirCandidates {
		targetPath, resolveErr = playerTransmissionResolveFilePath(
			dir,
			fileName,
			settings.TransmissionLocalDownloadDir,
		)
		if resolveErr == nil {
			break
		}
	}
	if resolveErr != nil {
		localDirProbe := playerTransmissionDescribeLocalDir(settings.TransmissionLocalDownloadDir)
		return PlayerTransmissionResolveStreamResult{}, fmt.Errorf(
			"%w: transmission download dir is not accessible from bitmagnet server; please configure player transmission local download directory mapping (downloadDir=%s, file=%s, localDirProbe=%s, details=%s)",
			ErrPlayerStorageUnavailable,
			strings.TrimSpace(readySnapshot.DownloadDir),
			fileName,
			localDirProbe,
			resolveErr.Error(),
		)
	}

	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(targetPath)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return PlayerTransmissionResolveStreamResult{
		FilePath:    targetPath,
		ContentType: contentType,
		RangeStart:  rangeStart,
		RangeEnd:    rangeEnd,
		TotalLength: fileLength,
		Partial:     partial,
		Transcode: PlayerFFmpegTranscodeSettings{
			Enabled:          true,
			BinaryPath:       settings.FFmpeg.BinaryPath,
			Preset:           settings.FFmpeg.Preset,
			CRF:              settings.FFmpeg.CRF,
			AudioBitrateKbps: settings.FFmpeg.AudioBitrateKbps,
			Threads:          settings.FFmpeg.Threads,
			ExtraArgs:        settings.FFmpeg.ExtraArgs,
		},
		AudioTrackIndex:  input.AudioTrackIndex,
		OutputResolution: input.OutputResolution,
		StartSeconds:     input.StartSeconds,
		StartBytes:       input.StartBytes,
	}, nil
}

func normalizePlayerOutputResolution(raw int) int {
	switch raw {
	case 480, 720, 1080, 2160:
		return raw
	default:
		return 0
	}
}

type playerFFprobeStream struct {
	Index       int               `json:"index"`
	CodecType   string            `json:"codec_type"`
	CodecName   string            `json:"codec_name"`
	Channels    int               `json:"channels"`
	Tags        map[string]string `json:"tags"`
	Disposition struct {
		Default int `json:"default"`
	} `json:"disposition"`
}

type playerFFprobeResult struct {
	Streams []playerFFprobeStream `json:"streams"`
}

func playerTransmissionProbeAudioTracks(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
) ([]PlayerTransmissionAudioTrack, error) {
	ffprobePath := playerTransmissionResolveFFprobePath(ffmpegBinaryPath)
	cmd := exec.CommandContext(
		ctx,
		ffprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_streams",
		"-select_streams", "a",
		filePath,
	)
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var payload playerFFprobeResult
	if err := json.Unmarshal(output, &payload); err != nil {
		return nil, err
	}
	result := make([]PlayerTransmissionAudioTrack, 0, len(payload.Streams))
	for idx, stream := range payload.Streams {
		if strings.TrimSpace(strings.ToLower(stream.CodecType)) != "audio" {
			continue
		}
		label := strings.TrimSpace(stream.Tags["title"])
		if label == "" {
			label = fmt.Sprintf("Track %d", idx+1)
		}
		result = append(result, PlayerTransmissionAudioTrack{
			Index:       idx,
			StreamIndex: stream.Index,
			Label:       label,
			Language:    strings.TrimSpace(stream.Tags["language"]),
			Codec:       strings.TrimSpace(stream.CodecName),
			Channels:    stream.Channels,
			Default:     stream.Disposition.Default > 0,
		})
	}
	return result, nil
}

func playerTransmissionResolveFFprobePath(ffmpegBinaryPath string) string {
	ffmpegPath := strings.TrimSpace(ffmpegBinaryPath)
	if ffmpegPath == "" {
		return "ffprobe"
	}
	lowerName := strings.ToLower(filepath.Base(ffmpegPath))
	if strings.HasPrefix(lowerName, "ffmpeg") {
		return filepath.Join(filepath.Dir(ffmpegPath), "ffprobe")
	}
	return "ffprobe"
}

func (s *service) loadPlayerTransmissionBase(
	ctx context.Context,
	infoHashInput string,
) (string, *gorm.DB, model.Torrent, playerBootstrapSettings, error) {
	q, err := s.dao.Get()
	if err != nil {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, err
	}

	infoHash := strings.TrimSpace(strings.ToLower(infoHashInput))
	if infoHash == "" {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, ErrInvalidInfoHash
	}
	parsed, err := protocol.ParseID(infoHash)
	if err != nil {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, ErrInvalidInfoHash
	}

	db := q.Torrent.WithContext(ctx).UnderlyingDB()
	var torrent model.Torrent
	if err := db.WithContext(ctx).
		Table(model.TableNameTorrent).
		Where("info_hash = ?", parsed).
		Take(&torrent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, model.Torrent{}, playerBootstrapSettings{}, ErrNotFound
		}
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, err
	}

	settings, err := s.loadPlayerBootstrapSettings(ctx, db)
	if err != nil {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, err
	}
	if !settings.PlayerEnabled {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, ErrPlayerDisabled
	}
	if !settings.TransmissionEnabled {
		return "", nil, model.Torrent{}, playerBootstrapSettings{}, ErrPlayerTransmissionDisabled
	}

	return infoHash, db, torrent, settings, nil
}

func (s *service) playerTransmissionEnsureTorrent(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	magnetURI string,
) (*playerTransmissionRPCTorrent, error) {
	existing, err := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, false)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	if strings.TrimSpace(magnetURI) == "" {
		return nil, ErrNotFound
	}

	paused := false
	addPayload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-add",
		Arguments: playerTransmissionRPCArguments{
			Filename: strings.TrimSpace(magnetURI),
			Paused:   &paused,
		},
	})

	addResponseRaw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		addPayload,
	)
	if err != nil {
		return nil, err
	}

	var addResponse playerTransmissionRPCResponse
	if err := json.Unmarshal(addResponseRaw, &addResponse); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(addResponse.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-add result=%q", strings.TrimSpace(addResponse.Result))
	}

	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	for attempt := 0; attempt < 20; attempt++ {
		current, fetchErr := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, false)
		if fetchErr == nil {
			return current, nil
		}
		if !errors.Is(fetchErr, ErrNotFound) {
			return nil, fetchErr
		}
		time.Sleep(500 * time.Millisecond)
	}

	return nil, ErrNotFound
}

func (s *service) playerTransmissionFetchTorrent(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	includePieces bool,
) (*playerTransmissionRPCTorrent, error) {
	fields := []string{
		"id",
		"hashString",
		"name",
		"status",
		"percentDone",
		"rateDownload",
		"rateUpload",
		"peersConnected",
		"error",
		"errorString",
		"leftUntilDone",
		"downloadDir",
		"files",
		"fileStats",
		"sequential_download",
	}
	if includePieces {
		fields = append(fields, "pieces", "pieceSize")
	}

	reqPayload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-get",
		Arguments: playerTransmissionRPCArguments{
			IDs:    []any{infoHash},
			Fields: fields,
		},
	})

	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		reqPayload,
	)
	if err != nil {
		return nil, err
	}

	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}

	for _, item := range response.Arguments.Torrents {
		if strings.EqualFold(strings.TrimSpace(item.HashString), infoHash) {
			copied := item
			return &copied, nil
		}
	}
	if len(response.Arguments.Torrents) > 0 {
		copied := response.Arguments.Torrents[0]
		return &copied, nil
	}
	return nil, ErrNotFound
}

func (s *service) playerTransmissionFetchTorrents(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHashes []string,
) (map[string]playerTransmissionRPCTorrent, error) {
	if len(infoHashes) == 0 {
		return map[string]playerTransmissionRPCTorrent{}, nil
	}

	ids := make([]any, 0, len(infoHashes))
	for _, infoHash := range infoHashes {
		ids = append(ids, infoHash)
	}
	reqPayload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-get",
		Arguments: playerTransmissionRPCArguments{
			IDs: ids,
			Fields: []string{
				"id",
				"hashString",
				"status",
				"percentDone",
			},
		},
	})

	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		reqPayload,
	)
	if err != nil {
		return nil, err
	}

	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}

	result := make(map[string]playerTransmissionRPCTorrent, len(response.Arguments.Torrents))
	for _, item := range response.Arguments.Torrents {
		key := strings.TrimSpace(strings.ToLower(item.HashString))
		if key == "" {
			continue
		}
		result[key] = item
	}
	return result, nil
}

func (s *service) playerTransmissionSetOnlyWantedFile(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	fileIndex int,
	files []playerTransmissionRPCFile,
) error {
	fileCount := len(files)
	if fileIndex < 0 || fileIndex >= fileCount {
		return ErrPlayerFileNotFound
	}

	wantedSet := make(map[int]struct{}, fileCount)
	wantedSet[fileIndex] = struct{}{}
	allowedVideoExtensions := playerTransmissionAllowedVideoExtensions(settings.TransmissionDownloadVideoFormats)
	for idx, file := range files {
		if idx == fileIndex {
			continue
		}
		if playerTransmissionIsVideoFile(file.Name, allowedVideoExtensions) {
			wantedSet[idx] = struct{}{}
		}
	}
	wanted := make([]int, 0, len(wantedSet))
	priorityNormal := make([]int, 0, len(wantedSet))
	unwanted := make([]int, 0, fileCount)
	for idx := 0; idx < fileCount; idx++ {
		if _, ok := wantedSet[idx]; ok {
			wanted = append(wanted, idx)
			if idx != fileIndex {
				priorityNormal = append(priorityNormal, idx)
			}
			continue
		}
		unwanted = append(unwanted, idx)
	}

	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-set",
		Arguments: playerTransmissionRPCArguments{
			IDs:            []any{infoHash},
			FilesWanted:    wanted,
			FilesUnwanted:  unwanted,
			PriorityHigh:   []int{fileIndex},
			PriorityNormal: priorityNormal,
			PriorityLow:    []int{},
			Sequential:     boolPtr(settings.TransmissionSequential),
		},
	})

	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return err
	}

	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return fmt.Errorf("transmission torrent-set result=%q", strings.TrimSpace(response.Result))
	}

	return nil
}

func (s *service) playerTransmissionTryStart(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
) error {
	methods := []string{"torrent-start-now", "torrent-start"}
	var lastErr error
	for _, method := range methods {
		payload, _ := json.Marshal(playerTransmissionRPCRequest{
			Method: method,
			Arguments: playerTransmissionRPCArguments{
				IDs: []any{infoHash},
			},
		})
		raw, err := callTransmissionRPC(
			ctx,
			settings.TransmissionURL,
			settings.TransmissionUsername,
			settings.TransmissionPassword,
			settings.TransmissionInsecureTLS,
			settings.TransmissionTimeoutSeconds,
			payload,
		)
		if err != nil {
			lastErr = err
			continue
		}
		var response playerTransmissionRPCResponse
		if err := json.Unmarshal(raw, &response); err != nil {
			lastErr = err
			continue
		}
		if strings.EqualFold(strings.TrimSpace(response.Result), "success") {
			return nil
		}
		lastErr = fmt.Errorf("transmission %s result=%q", method, strings.TrimSpace(response.Result))
	}
	return lastErr
}

func (s *service) playerTransmissionAutoCleanup(
	ctx context.Context,
	settings playerBootstrapSettings,
	preserveInfoHash string,
) error {
	if !settings.TransmissionCleanupEnabled {
		return nil
	}
	slowCleanupEnabled := settings.TransmissionCleanupSlowTaskEnabled
	storageCleanupEnabled := settings.TransmissionCleanupStorageEnabled

	torrents, err := s.playerTransmissionLoadAllTorrents(ctx, settings)
	if err != nil {
		return err
	}
	if len(torrents) == 0 {
		return nil
	}

	preserveHash := strings.TrimSpace(strings.ToLower(preserveInfoHash))
	toRemove := make(map[int64]struct{})
	estimatedFreeGain := int64(0)
	totalSizeHint := int64(0)
	for _, item := range torrents {
		totalSizeHint += playerTransmissionTorrentSizeHint(item)
	}
	markRemove := func(item playerTransmissionRPCTorrent) {
		if item.ID <= 0 {
			return
		}
		if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
			return
		}
		if _, ok := toRemove[item.ID]; ok {
			return
		}
		toRemove[item.ID] = struct{}{}
		estimatedFreeGain += playerTransmissionTorrentSizeHint(item)
	}

	for _, item := range torrents {
		if item.Error > 0 || strings.TrimSpace(item.ErrorString) != "" {
			markRemove(item)
		}
	}

	if slowCleanupEnabled && settings.TransmissionCleanupSlowRateKbps > 0 && settings.TransmissionCleanupSlowWindowMinutes >= 5 {
		nowUnix := time.Now().Unix()
		windowSeconds := int64(settings.TransmissionCleanupSlowWindowMinutes) * 60
		rateThreshold := int64(settings.TransmissionCleanupSlowRateKbps) * 1024
		for _, item := range torrents {
			if item.LeftUntilDone <= 0 || item.IsFinished {
				continue
			}
			if item.Status != 3 && item.Status != 4 {
				continue
			}
			if item.AddedDate <= 0 || nowUnix-item.AddedDate < windowSeconds {
				continue
			}
			if item.RateDownload >= rateThreshold {
				continue
			}
			markRemove(item)
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMaxTotalSizeGB > 0 {
		threshold := int64(settings.TransmissionCleanupMaxTotalSizeGB) * 1024 * 1024 * 1024
		if threshold > 0 {
			currentTotal := totalSizeHint - estimatedFreeGain
			if currentTotal > threshold {
				needTrim := currentTotal - threshold
				ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
				sort.Slice(ordered, func(i, j int) bool {
					left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
					right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
					if left == right {
						return ordered[i].ID < ordered[j].ID
					}
					return left < right
				})
				trimmed := int64(0)
				for _, item := range ordered {
					if trimmed >= needTrim {
						break
					}
					if _, ok := toRemove[item.ID]; ok {
						trimmed += playerTransmissionTorrentSizeHint(item)
						continue
					}
					markRemove(item)
					trimmed += playerTransmissionTorrentSizeHint(item)
				}
			}
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMaxTasks > 0 {
		remainingCount := len(torrents) - len(toRemove)
		if remainingCount > settings.TransmissionCleanupMaxTasks {
			ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
			sort.Slice(ordered, func(i, j int) bool {
				left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
				right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
				if left == right {
					return ordered[i].ID < ordered[j].ID
				}
				return left < right
			})
			need := remainingCount - settings.TransmissionCleanupMaxTasks
			for _, item := range ordered {
				if need <= 0 {
					break
				}
				if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
					continue
				}
				if _, ok := toRemove[item.ID]; ok {
					continue
				}
				markRemove(item)
				need--
			}
		}
	}

	if storageCleanupEnabled && settings.TransmissionCleanupMinFreeSpaceGB > 0 {
		freeBytes, freeErr := s.playerTransmissionLoadFreeSpace(ctx, settings)
		if freeErr == nil {
			threshold := int64(settings.TransmissionCleanupMinFreeSpaceGB) * 1024 * 1024 * 1024
			if freeBytes+estimatedFreeGain < threshold {
				needGain := threshold - (freeBytes + estimatedFreeGain)
				ordered := append([]playerTransmissionRPCTorrent(nil), torrents...)
				sort.Slice(ordered, func(i, j int) bool {
					iFinished := ordered[i].IsFinished || ordered[i].LeftUntilDone <= 0
					jFinished := ordered[j].IsFinished || ordered[j].LeftUntilDone <= 0
					if iFinished != jFinished {
						return iFinished
					}
					left := maxInt64(ordered[i].ActivityDate, ordered[i].AddedDate)
					right := maxInt64(ordered[j].ActivityDate, ordered[j].AddedDate)
					if left == right {
						return ordered[i].ID < ordered[j].ID
					}
					return left < right
				})
				collected := int64(0)
				for _, item := range ordered {
					if collected >= needGain {
						break
					}
					if preserveHash != "" && strings.EqualFold(strings.TrimSpace(item.HashString), preserveHash) {
						continue
					}
					if _, ok := toRemove[item.ID]; ok {
						collected += playerTransmissionTorrentSizeHint(item)
						continue
					}
					markRemove(item)
					collected += playerTransmissionTorrentSizeHint(item)
				}
			}
		}
	}

	if len(toRemove) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(toRemove))
	for id := range toRemove {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return s.playerTransmissionRemoveTorrents(ctx, settings, ids)
}

func (s *service) playerTransmissionLoadAllTorrents(
	ctx context.Context,
	settings playerBootstrapSettings,
) ([]playerTransmissionRPCTorrent, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-get",
		Arguments: playerTransmissionRPCArguments{
			Fields: []string{
				"id",
				"hashString",
				"name",
				"status",
				"percentDone",
				"rateDownload",
				"rateUpload",
				"error",
				"errorString",
				"leftUntilDone",
				"sizeWhenDone",
				"addedDate",
				"activityDate",
				"isFinished",
			},
		},
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}
	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.Torrents, nil
}

func (s *service) playerTransmissionLoadFreeSpace(
	ctx context.Context,
	settings playerBootstrapSettings,
) (int64, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "session-get",
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return 0, err
	}
	var response playerTransmissionRPCSessionResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return 0, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return 0, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.DownloadDirFreeSpace, nil
}

func (s *service) playerTransmissionLoadSessionDirs(
	ctx context.Context,
	settings playerBootstrapSettings,
) ([]string, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "session-get",
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}
	var response playerTransmissionRPCSessionResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}

	dirs := make([]string, 0, 2)
	if downloadDir := strings.TrimSpace(response.Arguments.DownloadDir); downloadDir != "" {
		dirs = append(dirs, downloadDir)
	}
	if response.Arguments.IncompleteDirEnabled {
		if incompleteDir := strings.TrimSpace(response.Arguments.IncompleteDir); incompleteDir != "" {
			dirs = append(dirs, incompleteDir)
		}
	}
	return dirs, nil
}

func (s *service) playerTransmissionRemoveTorrents(
	ctx context.Context,
	settings playerBootstrapSettings,
	ids []int64,
) error {
	if len(ids) == 0 {
		return nil
	}
	idValues := make([]any, 0, len(ids))
	for _, id := range ids {
		idValues = append(idValues, id)
	}
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-remove",
		Arguments: playerTransmissionRPCArguments{
			IDs:             idValues,
			DeleteLocalData: boolPtr(true),
		},
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return err
	}
	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return fmt.Errorf("transmission torrent-remove result=%q", strings.TrimSpace(response.Result))
	}
	return nil
}

func (s *service) playerTransmissionLoadStatus(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	includePieces bool,
) (PlayerTransmissionStatusResult, error) {
	snapshot, err := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, includePieces)
	if err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	return playerTransmissionBuildStatus(infoHash, snapshot, settings.TransmissionDownloadVideoFormats), nil
}

func playerTransmissionBuildStatus(
	infoHash string,
	snapshot *playerTransmissionRPCTorrent,
	allowedVideoExtensions []string,
) PlayerTransmissionStatusResult {
	files := make([]PlayerTransmissionFile, 0, len(snapshot.Files))
	selectedIndex := -1
	for idx, file := range snapshot.Files {
		stats := playerTransmissionRPCFileStat{}
		if idx < len(snapshot.FileStats) {
			stats = snapshot.FileStats[idx]
		}
		item := PlayerTransmissionFile{
			Index:          idx,
			Name:           file.Name,
			Length:         file.Length,
			BytesCompleted: stats.BytesCompleted,
			Wanted:         stats.Wanted,
			Priority:       stats.Priority,
			IsVideo:        playerTransmissionIsVideoFile(file.Name, allowedVideoExtensions),
		}
		files = append(files, item)
		if selectedIndex < 0 && item.Wanted {
			selectedIndex = idx
		}
	}
	if selectedIndex < 0 && len(snapshot.Files) > 0 {
		selectedIndex = playerTransmissionDefaultFileIndex(snapshot.Files, allowedVideoExtensions)
	}

	selectedBytes := int64(0)
	selectedLength := int64(0)
	if selectedIndex >= 0 && selectedIndex < len(files) {
		selectedBytes = files[selectedIndex].BytesCompleted
		selectedLength = files[selectedIndex].Length
	}
	selectedReady := 0.0
	if selectedLength > 0 {
		selectedReady = clampRatio(float64(selectedBytes) / float64(selectedLength))
	}
	selectedContiguousBytes := playerTransmissionContiguousBytesFromStart(snapshot, selectedIndex)
	selectedContiguousRatio := 0.0
	if selectedLength > 0 {
		selectedContiguousRatio = clampRatio(float64(selectedContiguousBytes) / float64(selectedLength))
	}
	selectedAvailableRanges := playerTransmissionAvailableRanges(snapshot, selectedIndex)

	return PlayerTransmissionStatusResult{
		InfoHash:                    infoHash,
		TorrentID:                   snapshot.ID,
		Name:                        snapshot.Name,
		State:                       playerTransmissionStatusLabel(snapshot.Status),
		Progress:                    clampRatio(snapshot.PercentDone),
		DownloadRate:                snapshot.RateDownload,
		UploadRate:                  snapshot.RateUpload,
		PeersConnected:              snapshot.PeersConnected,
		ErrorCode:                   snapshot.Error,
		ErrorMessage:                strings.TrimSpace(snapshot.ErrorString),
		SelectedFileIndex:           selectedIndex,
		SelectedFileBytesCompleted:  selectedBytes,
		SelectedFileLength:          selectedLength,
		SelectedFileReadyRatio:      selectedReady,
		SelectedFileContiguousBytes: selectedContiguousBytes,
		SelectedFileContiguousRatio: selectedContiguousRatio,
		SelectedFileAvailableRanges: selectedAvailableRanges,
		SequentialDownload:          snapshot.Sequential,
		Files:                       files,
		UpdatedAt:                   time.Now(),
	}
}

func boolPtr(value bool) *bool {
	v := value
	return &v
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func minInt64(left int64, right int64) int64 {
	if left < right {
		return left
	}
	return right
}

func playerTransmissionTorrentSizeHint(item playerTransmissionRPCTorrent) int64 {
	return maxInt64(item.SizeWhenDone, item.LeftUntilDone)
}

func playerTransmissionBuildStreamURL(infoHash string, fileIndex int) string {
	query := url.Values{}
	query.Set("infoHash", infoHash)
	query.Set("fileIndex", strconv.Itoa(fileIndex))
	return "/api/media/player/transmission/stream?" + query.Encode()
}

func playerTransmissionDefaultFileIndex(files []playerTransmissionRPCFile, allowedVideoExtensions []string) int {
	if len(files) == 0 {
		return -1
	}
	for idx, file := range files {
		if playerTransmissionIsVideoFile(file.Name, allowedVideoExtensions) {
			return idx
		}
	}
	return 0
}

func playerTransmissionIsVideoFile(name string, allowedVideoExtensions []string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	for _, ext := range playerTransmissionAllowedVideoExtensions(allowedVideoExtensions) {
		if strings.HasSuffix(normalized, ext) {
			return true
		}
	}
	return false
}

func playerTransmissionAllowedVideoExtensions(configured []string) []string {
	if len(configured) == 0 {
		return playerVideoExtensions
	}
	return configured
}

func playerTransmissionStatusLabel(value int) string {
	switch value {
	case 0:
		return "stopped"
	case 1:
		return "check_wait"
	case 2:
		return "checking"
	case 3:
		return "download_wait"
	case 4:
		return "downloading"
	case 5:
		return "seed_wait"
	case 6:
		return "seeding"
	default:
		return fmt.Sprintf("unknown_%d", value)
	}
}

func clampRatio(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func playerTransmissionFileCompletedBytes(snapshot *playerTransmissionRPCTorrent, fileIndex int) int64 {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return 0
	}
	if fileIndex >= len(snapshot.FileStats) {
		return 0
	}
	completed := snapshot.FileStats[fileIndex].BytesCompleted
	if completed < 0 {
		completed = 0
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength > 0 && completed > fileLength {
		completed = fileLength
	}
	return completed
}

func playerTransmissionFileFullyCompleted(snapshot *playerTransmissionRPCTorrent, fileIndex int) bool {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return false
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength <= 0 {
		return false
	}
	return playerTransmissionFileCompletedBytes(snapshot, fileIndex) >= fileLength
}

func playerTransmissionContiguousBytesFromStart(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
) int64 {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return 0
	}
	fileLength := snapshot.Files[fileIndex].Length
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return fileLength
	}
	if fileLength <= 0 {
		return 0
	}
	completedBytes := playerTransmissionFileCompletedBytes(snapshot, fileIndex)
	if completedBytes <= 0 {
		return 0
	}
	if snapshot.PieceSize <= 0 || strings.TrimSpace(snapshot.Pieces) == "" {
		if snapshot.Sequential {
			return minInt64(completedBytes, fileLength)
		}
		return 0
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		if snapshot.Sequential {
			return minInt64(completedBytes, fileLength)
		}
		return 0
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}
	fileEndGlobal := fileOffset + fileLength - 1
	if fileEndGlobal < fileOffset {
		return 0
	}

	firstPiece := int(fileOffset / snapshot.PieceSize)
	lastPiece := int(fileEndGlobal / snapshot.PieceSize)
	if firstPiece < 0 || lastPiece < firstPiece {
		return 0
	}

	contiguousBytes := int64(0)
	for piece := firstPiece; piece <= lastPiece; piece++ {
		pieceBytes := playerTransmissionPieceOverlapBytes(fileOffset, fileEndGlobal, snapshot.PieceSize, piece)
		if pieceBytes <= 0 {
			continue
		}
		if playerTransmissionHasPiece(pieceBits, piece) {
			contiguousBytes += pieceBytes
			continue
		}
		if piece == firstPiece && snapshot.Sequential {
			// A file can start in the middle of a piece shared with another file. In that case
			// the piece bit may stay unset even though the selected file's bytes are already ready.
			optimisticPrefix := minInt64(completedBytes, pieceBytes)
			if optimisticPrefix > contiguousBytes {
				contiguousBytes = optimisticPrefix
			}
			if optimisticPrefix >= pieceBytes {
				continue
			}
		}
		break
	}

	if contiguousBytes > fileLength {
		return fileLength
	}
	if contiguousBytes < 0 {
		return 0
	}
	return contiguousBytes
}

func playerTransmissionPieceOverlapBytes(
	fileOffset int64,
	fileEndGlobal int64,
	pieceSize int64,
	piece int,
) int64 {
	if fileEndGlobal < fileOffset || pieceSize <= 0 || piece < 0 {
		return 0
	}
	pieceStart := int64(piece) * pieceSize
	pieceEnd := pieceStart + pieceSize - 1
	if pieceEnd < fileOffset || pieceStart > fileEndGlobal {
		return 0
	}
	if pieceStart < fileOffset {
		pieceStart = fileOffset
	}
	if pieceEnd > fileEndGlobal {
		pieceEnd = fileEndGlobal
	}
	if pieceEnd < pieceStart {
		return 0
	}
	return pieceEnd - pieceStart + 1
}

func playerTransmissionMergeRanges(ranges []PlayerFileRange) []PlayerFileRange {
	if len(ranges) == 0 {
		return nil
	}
	normalized := make([]PlayerFileRange, 0, len(ranges))
	for _, item := range ranges {
		start := clampRatio(item.StartRatio)
		end := clampRatio(item.EndRatio)
		if end <= start {
			continue
		}
		normalized = append(normalized, PlayerFileRange{
			StartRatio: start,
			EndRatio:   end,
		})
	}
	if len(normalized) == 0 {
		return nil
	}
	sort.Slice(normalized, func(i, j int) bool {
		if normalized[i].StartRatio == normalized[j].StartRatio {
			return normalized[i].EndRatio < normalized[j].EndRatio
		}
		return normalized[i].StartRatio < normalized[j].StartRatio
	})
	merged := make([]PlayerFileRange, 0, len(normalized))
	for _, item := range normalized {
		if len(merged) == 0 {
			merged = append(merged, item)
			continue
		}
		last := &merged[len(merged)-1]
		if item.StartRatio <= last.EndRatio+1e-9 {
			if item.EndRatio > last.EndRatio {
				last.EndRatio = item.EndRatio
			}
			continue
		}
		merged = append(merged, item)
	}
	return merged
}

func playerTransmissionAvailableRanges(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
) []PlayerFileRange {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return nil
	}
	fileLength := snapshot.Files[fileIndex].Length
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return []PlayerFileRange{
			{
				StartRatio: 0,
				EndRatio:   1,
			},
		}
	}
	if fileLength <= 0 {
		return nil
	}

	ranges := make([]PlayerFileRange, 0, 64)
	contiguousBytes := playerTransmissionContiguousBytesFromStart(snapshot, fileIndex)
	if contiguousBytes > 0 {
		ranges = append(ranges, PlayerFileRange{
			StartRatio: 0,
			EndRatio:   clampRatio(float64(contiguousBytes) / float64(fileLength)),
		})
	}
	if snapshot.PieceSize <= 0 || strings.TrimSpace(snapshot.Pieces) == "" {
		return playerTransmissionMergeRanges(ranges)
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		return playerTransmissionMergeRanges(ranges)
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}
	fileEndGlobal := fileOffset + fileLength - 1
	if fileEndGlobal < fileOffset {
		return playerTransmissionMergeRanges(ranges)
	}

	firstPiece := int(fileOffset / snapshot.PieceSize)
	lastPiece := int(fileEndGlobal / snapshot.PieceSize)
	if firstPiece < 0 || lastPiece < firstPiece {
		return playerTransmissionMergeRanges(ranges)
	}

	const maxRanges = 1200
	currentStart := -1
	flush := func(runStart int, runEnd int) {
		if runStart < 0 || runEnd < runStart || len(ranges) >= maxRanges {
			return
		}
		globalStart := int64(runStart) * snapshot.PieceSize
		globalEnd := int64(runEnd+1)*snapshot.PieceSize - 1
		if globalStart < fileOffset {
			globalStart = fileOffset
		}
		if globalEnd > fileEndGlobal {
			globalEnd = fileEndGlobal
		}
		if globalEnd < globalStart {
			return
		}
		start := clampRatio(float64(globalStart-fileOffset) / float64(fileLength))
		end := clampRatio(float64(globalEnd-fileOffset+1) / float64(fileLength))
		if end <= start {
			return
		}
		ranges = append(ranges, PlayerFileRange{
			StartRatio: start,
			EndRatio:   end,
		})
	}

	for piece := firstPiece; piece <= lastPiece; piece++ {
		hasPiece := playerTransmissionHasPiece(pieceBits, piece)
		if hasPiece {
			if currentStart < 0 {
				currentStart = piece
			}
			continue
		}
		if currentStart >= 0 {
			flush(currentStart, piece-1)
			currentStart = -1
		}
		if len(ranges) >= maxRanges {
			break
		}
	}
	if currentStart >= 0 && len(ranges) < maxRanges {
		flush(currentStart, lastPiece)
	}
	return playerTransmissionMergeRanges(ranges)
}

func playerTransmissionHasPiece(pieceBits []byte, piece int) bool {
	byteIndex := piece / 8
	if byteIndex < 0 || byteIndex >= len(pieceBits) {
		return false
	}
	bitIndex := uint(7 - (piece % 8))
	return (pieceBits[byteIndex] & (1 << bitIndex)) != 0
}

func parsePlayerByteRange(header string, total int64) (int64, int64, bool, error) {
	if total <= 0 {
		return 0, 0, false, ErrPlayerInvalidRange
	}

	if strings.TrimSpace(header) == "" {
		end := total - 1
		limit := defaultPlayerStreamProbeChunkBytes - 1
		if end > limit {
			end = limit
		}
		return 0, end, true, nil
	}

	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	spec := strings.TrimSpace(trimmed[6:])
	if spec == "" {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if comma := strings.Index(spec, ","); comma >= 0 {
		spec = strings.TrimSpace(spec[:comma])
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return 0, 0, false, ErrPlayerInvalidRange
	}

	left := strings.TrimSpace(parts[0])
	right := strings.TrimSpace(parts[1])

	var start int64
	var end int64
	if left == "" {
		suffixLen, err := strconv.ParseInt(right, 10, 64)
		if err != nil || suffixLen <= 0 {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if suffixLen >= total {
			start = 0
		} else {
			start = total - suffixLen
		}
		end = total - 1
		return start, end, true, nil
	}

	parsedStart, err := strconv.ParseInt(left, 10, 64)
	if err != nil || parsedStart < 0 || parsedStart >= total {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	start = parsedStart

	if right == "" {
		end = total - 1
		limit := start + defaultPlayerStreamProbeChunkBytes - 1
		if end > limit {
			end = limit
		}
	} else {
		parsedEnd, endErr := strconv.ParseInt(right, 10, 64)
		if endErr != nil || parsedEnd < start {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if parsedEnd >= total {
			end = total - 1
		} else {
			end = parsedEnd
		}
	}
	maxEnd := start + defaultPlayerStreamMaxRangeBytes - 1
	if end > maxEnd {
		end = maxEnd
	}

	return start, end, true, nil
}

func parsePlayerByteRangeForCompletedFile(header string, total int64) (int64, int64, bool, error) {
	if total <= 0 {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if strings.TrimSpace(header) == "" {
		return 0, total - 1, false, nil
	}

	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	spec := strings.TrimSpace(trimmed[6:])
	if spec == "" {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if comma := strings.Index(spec, ","); comma >= 0 {
		spec = strings.TrimSpace(spec[:comma])
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return 0, 0, false, ErrPlayerInvalidRange
	}

	left := strings.TrimSpace(parts[0])
	right := strings.TrimSpace(parts[1])

	var start int64
	var end int64
	if left == "" {
		suffixLen, err := strconv.ParseInt(right, 10, 64)
		if err != nil || suffixLen <= 0 {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if suffixLen >= total {
			start = 0
		} else {
			start = total - suffixLen
		}
		end = total - 1
		return start, end, true, nil
	}

	parsedStart, err := strconv.ParseInt(left, 10, 64)
	if err != nil || parsedStart < 0 || parsedStart >= total {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	start = parsedStart

	if right == "" {
		end = total - 1
	} else {
		parsedEnd, endErr := strconv.ParseInt(right, 10, 64)
		if endErr != nil || parsedEnd < start {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if parsedEnd >= total {
			end = total - 1
		} else {
			end = parsedEnd
		}
	}
	return start, end, true, nil
}

func playerTransmissionRangeAvailable(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
	start int64,
	end int64,
) bool {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return false
	}
	if start < 0 || end < start {
		return false
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength > 0 && (start >= fileLength || end >= fileLength) {
		return false
	}
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return true
	}
	contiguous := playerTransmissionContiguousBytesFromStart(snapshot, fileIndex)
	if contiguous > 0 && end < contiguous {
		return true
	}
	if snapshot.PieceSize <= 0 {
		return false
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		return false
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}

	globalStart := fileOffset + start
	globalEnd := fileOffset + end
	if globalStart < 0 || globalEnd < globalStart {
		return false
	}

	firstPiece := int(globalStart / snapshot.PieceSize)
	lastPiece := int(globalEnd / snapshot.PieceSize)
	for piece := firstPiece; piece <= lastPiece; piece++ {
		if !playerTransmissionHasPiece(pieceBits, piece) {
			return false
		}
	}
	return true
}

func playerTransmissionResolveFilePath(downloadDir string, fileName string, localDownloadDir string) (string, error) {
	relative := filepath.Clean(filepath.FromSlash(strings.TrimSpace(fileName)))
	if relative == "." || strings.HasPrefix(relative, "..") || filepath.IsAbs(relative) {
		return "", ErrNotFound
	}

	baseDirs := buildTransmissionPathCandidates(downloadDir, localDownloadDir)
	basename := filepath.Base(relative)
	for _, baseDir := range baseDirs {
		if baseDir == "" {
			continue
		}
		candidates := []string{
			filepath.Join(baseDir, relative),
			filepath.Join(baseDir, basename),
			filepath.Join(baseDir, "complete", relative),
			filepath.Join(baseDir, "complete", basename),
			filepath.Join(baseDir, "incomplete", relative),
			filepath.Join(baseDir, "incomplete", basename),
		}
		for _, candidate := range candidates {
			relCheck, err := filepath.Rel(baseDir, candidate)
			if err != nil || strings.HasPrefix(relCheck, "..") {
				continue
			}
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
			partialCandidate := candidate + ".part"
			if _, err := os.Stat(partialCandidate); err == nil {
				return partialCandidate, nil
			}
		}
	}

	for _, baseDir := range baseDirs {
		if baseDir == "" {
			continue
		}
		if looseMatch, matchErr := playerTransmissionFindFileLoosely(baseDir, relative); matchErr == nil && strings.TrimSpace(looseMatch) != "" {
			return looseMatch, nil
		}
	}

	return "", fmt.Errorf("stream file not found (downloadDir=%s, file=%s, baseCandidates=%s): %w",
		strings.TrimSpace(downloadDir),
		strings.TrimSpace(fileName),
		strings.Join(baseDirs, " | "),
		ErrNotFound,
	)
}

func buildTransmissionPathCandidates(downloadDir string, localDownloadDir string) []string {
	normalized := filepath.Clean(strings.TrimSpace(downloadDir))
	if normalized == "" {
		return nil
	}
	candidates := make([]string, 0, 8)
	appendCandidate := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		if !filepath.IsAbs(path) {
			if absPath, err := filepath.Abs(path); err == nil {
				path = absPath
			}
		}
		path = filepath.Clean(path)
		for _, existing := range candidates {
			if strings.EqualFold(existing, path) {
				return
			}
		}
		candidates = append(candidates, path)
	}

	appendCandidate(normalized)
	if baseName := strings.ToLower(strings.TrimSpace(filepath.Base(normalized))); baseName == "complete" || baseName == "incomplete" {
		appendCandidate(filepath.Dir(normalized))
	}
	if override := strings.TrimSpace(os.Getenv("BITMAGNET_PLAYER_TRANSMISSION_LOCAL_DOWNLOAD_DIR")); override != "" {
		appendCandidate(override)
	}
	if override := strings.TrimSpace(localDownloadDir); override != "" {
		appendCandidate(override)
	}
	for _, mapped := range mapTransmissionRemotePathToLocal(normalized) {
		appendCandidate(mapped)
	}

	localRoots := make([]string, 0, 8)
	appendLocalRoot := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		localRoots = append(localRoots, path)
		appendCandidate(path)
	}
	appendLocalRoot("/root/.local/share/bitmagnet/transmission/downloads")
	appendLocalRoot("/var/lib/bitmagnet/transmission/downloads")
	if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
		appendLocalRoot(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads"))
	}
	if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
		appendLocalRoot(filepath.Join(wd, "data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "../data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "../backend/data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "backend/data/transmission/downloads"))
	}

	remoteSuffixes := transmissionCandidateSuffixes(normalized)
	for _, root := range localRoots {
		for _, suffix := range remoteSuffixes {
			appendCandidate(filepath.Join(root, suffix))
		}
	}

	remotePrefix := "/downloads"
	if strings.HasPrefix(normalized, remotePrefix) {
		suffix := strings.TrimPrefix(normalized, remotePrefix)
		appendCandidate(filepath.Join("/root/.local/share/bitmagnet/transmission/downloads"))
		appendCandidate(filepath.Join("/var/lib/bitmagnet/transmission/downloads"))
		if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
			appendCandidate(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads"))
		}
		if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
			appendCandidate(filepath.Join(wd, "data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "../data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "../backend/data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "backend/data/transmission/downloads"))
		}
		appendCandidate(filepath.Join("/root/.local/share/bitmagnet/transmission/downloads", suffix))
		appendCandidate(filepath.Join("/var/lib/bitmagnet/transmission/downloads", suffix))
		if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
			appendCandidate(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads", suffix))
		}
		if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
			appendCandidate(filepath.Join(wd, "data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "../data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "../backend/data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "backend/data/transmission/downloads", suffix))
		}
	}

	return candidates
}

func transmissionCandidateSuffixes(downloadDir string) []string {
	normalized := strings.ToLower(filepath.ToSlash(strings.TrimSpace(downloadDir)))
	if normalized == "" || normalized == "." || normalized == "/" {
		return nil
	}
	markers := []string{"/incomplete", "/complete", "/downloads"}
	suffixes := make([]string, 0, 3)
	seen := map[string]struct{}{}
	for _, marker := range markers {
		index := strings.Index(normalized, marker)
		if index < 0 {
			continue
		}
		suffix := strings.TrimPrefix(normalized[index:], "/")
		suffix = strings.TrimSpace(suffix)
		if suffix == "" || suffix == "." {
			continue
		}
		if _, ok := seen[suffix]; ok {
			continue
		}
		seen[suffix] = struct{}{}
		suffixes = append(suffixes, filepath.FromSlash(suffix))
	}
	return suffixes
}

func mapTransmissionRemotePathToLocal(remotePath string) []string {
	rulesRaw := strings.TrimSpace(os.Getenv("BITMAGNET_PLAYER_TRANSMISSION_PATH_MAP"))
	if rulesRaw == "" {
		return nil
	}
	normalizedRemote := filepath.Clean(strings.TrimSpace(remotePath))
	if normalizedRemote == "" {
		return nil
	}

	type mapRule struct {
		remote string
		local  string
	}
	rules := make([]mapRule, 0, 4)
	for _, item := range strings.Split(rulesRaw, ";") {
		part := strings.TrimSpace(item)
		if part == "" {
			continue
		}
		separator := "="
		if strings.Contains(part, "=>") {
			separator = "=>"
		}
		pairs := strings.SplitN(part, separator, 2)
		if len(pairs) != 2 {
			continue
		}
		remote := filepath.Clean(strings.TrimSpace(pairs[0]))
		local := filepath.Clean(strings.TrimSpace(pairs[1]))
		if remote == "" || remote == "." || local == "" || local == "." {
			continue
		}
		rules = append(rules, mapRule{remote: remote, local: local})
	}
	if len(rules) == 0 {
		return nil
	}

	mapped := make([]string, 0, len(rules)*2)
	for _, rule := range rules {
		if strings.EqualFold(normalizedRemote, rule.remote) {
			mapped = append(mapped, rule.local)
			continue
		}
		prefix := rule.remote
		if !strings.HasSuffix(prefix, string(os.PathSeparator)) {
			prefix += string(os.PathSeparator)
		}
		if strings.HasPrefix(normalizedRemote, prefix) {
			suffix := strings.TrimPrefix(normalizedRemote, prefix)
			mapped = append(mapped, filepath.Join(rule.local, suffix))
		}
	}
	return mapped
}

func playerTransmissionFindFileLoosely(baseDir string, relative string) (string, error) {
	base := strings.TrimSpace(baseDir)
	if base == "" {
		return "", ErrNotFound
	}

	relativeLower := strings.ToLower(filepath.ToSlash(relative))
	baseNameLower := strings.ToLower(filepath.Base(relative))
	if baseNameLower == "" || baseNameLower == "." {
		return "", ErrNotFound
	}

	type match struct {
		path  string
		score int
	}
	const maxVisited = 60000
	visited := 0
	matches := make([]match, 0, 4)
	stopWalk := errors.New("stop walk")

	walkErr := filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if visited >= maxVisited {
			return stopWalk
		}
		visited++
		if d.IsDir() {
			return nil
		}

		nameLower := strings.ToLower(d.Name())
		trimmedPart := strings.TrimSuffix(nameLower, ".part")
		if nameLower != baseNameLower && trimmedPart != baseNameLower {
			return nil
		}
		relativePath, relErr := filepath.Rel(base, path)
		if relErr != nil {
			return nil
		}
		relLower := strings.ToLower(filepath.ToSlash(relativePath))
		score := 60
		if strings.HasSuffix(relLower, relativeLower) {
			score = 0
		} else if strings.HasSuffix(relLower, "/"+baseNameLower) {
			score = 20
		}
		matches = append(matches, match{
			path:  path,
			score: score,
		})
		return nil
	})
	if walkErr != nil && !errors.Is(walkErr, stopWalk) {
		return "", walkErr
	}
	if len(matches) == 0 {
		return "", ErrNotFound
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].score != matches[j].score {
			return matches[i].score < matches[j].score
		}
		return len(matches[i].path) < len(matches[j].path)
	})
	return matches[0].path, nil
}

func playerTransmissionDescribeLocalDir(localDownloadDir string) string {
	trimmed := strings.TrimSpace(localDownloadDir)
	if trimmed == "" {
		return "unset"
	}

	info, err := os.Stat(trimmed)
	if err != nil {
		return fmt.Sprintf("%s (stat error: %v)", trimmed, err)
	}
	if !info.IsDir() {
		return fmt.Sprintf("%s (exists=true,isDir=false)", trimmed)
	}

	entries, readErr := os.ReadDir(trimmed)
	if readErr != nil {
		return fmt.Sprintf("%s (exists=true,isDir=true,readable=false,error=%v)", trimmed, readErr)
	}
	return fmt.Sprintf("%s (exists=true,isDir=true,readable=true,entries=%d)", trimmed, len(entries))
}

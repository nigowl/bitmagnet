package media

import (
	"context"
	"fmt"
	"math"
	"mime"
	"path/filepath"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/protocol"
)

const defaultPlayerStreamProbeChunkBytes int64 = 16 * 1024 * 1024
const defaultPlayerStreamMaxRangeBytes int64 = 64 * 1024 * 1024
const defaultPlayerStreamPollInterval = 700 * time.Millisecond

var playerVideoExtensions = []string{
	".mp4", ".m4v", ".webm", ".mkv", ".mov", ".avi", ".flv", ".ts", ".m2ts", ".mpeg", ".mpg",
	".wmv", ".asf", ".3gp", ".3g2", ".f4v", ".rm", ".rmvb", ".vob", ".mxf", ".divx", ".xvid",
}

type playerFileDurationCacheEntry struct {
	durationSeconds float64
	size            int64
	probedAt        time.Time
	failed          bool
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
	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, selected, snapshot, 0); err != nil {
		return PlayerTransmissionBootstrapResult{}, err
	}
	s.playerTransmissionRememberSelectedFile(infoHash, selected)
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	status, err := s.playerTransmissionLoadStatusForSelectedFile(ctx, settings, infoHash, true, selected)
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

	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, input.FileIndex, snapshot, 0); err != nil {
		return PlayerTransmissionSelectFileResult{}, err
	}
	s.playerTransmissionRememberSelectedFile(infoHash, input.FileIndex)
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	status, err := s.playerTransmissionLoadStatusForSelectedFile(ctx, settings, infoHash, true, input.FileIndex)
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
	infoHash, db, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	if _, err := s.playerTransmissionEnsureTorrent(ctx, settings, infoHash, torrent.MagnetURI()); err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	result, err := s.playerTransmissionLoadStatus(ctx, settings, infoHash, true)
	if err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, []string{infoHash}, map[string]playerTransmissionRPCTorrent{
		infoHash: {
			ID:          result.TorrentID,
			HashString:  result.InfoHash,
			PercentDone: result.Progress,
		},
	})
	return result, nil
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

	s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, infoHashes, snapshots)

	return PlayerTransmissionBatchStatusResult{Items: items}, nil
}

func (s *service) PlayerTransmissionClearCache(
	ctx context.Context,
	input PlayerTransmissionClearCacheInput,
) (PlayerTransmissionClearCacheResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return PlayerTransmissionClearCacheResult{}, err
	}
	db := q.Torrent.WithContext(ctx).UnderlyingDB()
	settings, err := s.loadPlayerBootstrapSettings(ctx, db)
	if err != nil {
		return PlayerTransmissionClearCacheResult{}, err
	}
	if !settings.PlayerEnabled {
		return PlayerTransmissionClearCacheResult{}, ErrPlayerDisabled
	}
	if !settings.TransmissionEnabled {
		return PlayerTransmissionClearCacheResult{}, ErrPlayerTransmissionDisabled
	}

	infoHashes := normalizePlayerInfoHashList(input.InfoHashes)
	if len(infoHashes) == 0 {
		return PlayerTransmissionClearCacheResult{Removed: 0}, nil
	}

	snapshots, err := s.playerTransmissionFetchTorrents(ctx, settings, infoHashes)
	if err != nil {
		return PlayerTransmissionClearCacheResult{}, err
	}
	ids := make([]int64, 0, len(snapshots))
	for _, snapshot := range snapshots {
		if snapshot.ID > 0 {
			ids = append(ids, snapshot.ID)
		}
	}
	if len(ids) == 0 {
		s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, infoHashes, map[string]playerTransmissionRPCTorrent{})
		s.playerTransmissionForgetSelectedFiles(infoHashes)
		return PlayerTransmissionClearCacheResult{Removed: 0}, nil
	}
	if err := s.playerTransmissionRemoveTorrents(ctx, settings, ids); err != nil {
		return PlayerTransmissionClearCacheResult{}, err
	}
	s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, infoHashes, map[string]playerTransmissionRPCTorrent{})
	s.playerTransmissionForgetSelectedFiles(infoHashes)
	return PlayerTransmissionClearCacheResult{Removed: len(ids)}, nil
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
	if current, fetchErr := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, true); fetchErr == nil {
		snapshot = current
	}
	if input.FileIndex >= len(snapshot.Files) {
		return PlayerTransmissionResolveStreamResult{}, ErrPlayerFileNotFound
	}

	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, infoHash, input.FileIndex, snapshot, input.StartBytes); err != nil {
		return PlayerTransmissionResolveStreamResult{}, err
	}
	s.playerTransmissionRememberSelectedFile(infoHash, input.FileIndex)
	_ = s.playerTransmissionTryStart(ctx, settings, infoHash)

	fileLength := snapshot.Files[input.FileIndex].Length
	if fileLength > 0 && input.StartBytes >= fileLength {
		input.StartBytes = fileLength - 1
	}
	maxRangeBytes := defaultPlayerStreamMaxRangeBytes
	if input.PreferTranscode && input.PrebufferSeconds > 0 {
		rangePrebufferSeconds := input.PrebufferSeconds
		if input.StartupPrebufferSeconds > 0 && input.StartupPrebufferSeconds < rangePrebufferSeconds {
			rangePrebufferSeconds = input.StartupPrebufferSeconds
		}
		prebufferWindowBytes := playerTransmissionPrebufferWindowBytes(fileLength, input.DurationSeconds, rangePrebufferSeconds)
		maxRangeBytes = maxInt64(maxRangeBytes, prebufferWindowBytes)
		input.RangeHeader = playerTransmissionPrebufferRangeHeader(
			input.RangeHeader,
			fileLength,
			input.StartBytes,
			input.DurationSeconds,
			rangePrebufferSeconds,
		)
	}
	rangeStart, rangeEnd, partial, err := parsePlayerByteRangeWithMax(input.RangeHeader, fileLength, maxRangeBytes)
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
		select {
		case <-ctx.Done():
			return PlayerTransmissionResolveStreamResult{}, ctx.Err()
		case <-time.After(defaultPlayerStreamPollInterval):
		}
	}
	completed := playerTransmissionFileFullyCompleted(readySnapshot, input.FileIndex)
	if completed {
		fullStart, fullEnd, fullPartial, rangeErr := parsePlayerByteRangeForCompletedFile(input.RangeHeader, fileLength)
		if rangeErr != nil {
			return PlayerTransmissionResolveStreamResult{}, rangeErr
		}
		rangeStart = fullStart
		rangeEnd = fullEnd
		partial = fullPartial
	}

	fileName := strings.TrimSpace(readySnapshot.Files[input.FileIndex].Name)
	targetPath, resolveErr := s.playerTransmissionResolveLocalFilePath(ctx, settings, readySnapshot, input.FileIndex)
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
		Completed:   completed,
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
	case 480, 720, 1080, 1440, 2160:
		return raw
	default:
		return 0
	}
}

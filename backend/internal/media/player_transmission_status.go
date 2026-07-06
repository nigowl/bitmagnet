package media

import (
	"context"
	"os"
	"strings"
	"time"
)

func playerTransmissionBuildStatus(
	infoHash string,
	snapshot *playerTransmissionRPCTorrent,
	allowedVideoExtensions []string,
) PlayerTransmissionStatusResult {
	files := make([]PlayerTransmissionFile, 0, len(snapshot.Files))
	selectedIndex := -1
	selectedPriority := 0
	selectedPrioritySet := false
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
		if item.Wanted && (!selectedPrioritySet || item.Priority > selectedPriority) {
			selectedIndex = idx
			selectedPriority = item.Priority
			selectedPrioritySet = true
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

func playerTransmissionApplySelectedFileStatus(
	snapshot *playerTransmissionRPCTorrent,
	status *PlayerTransmissionStatusResult,
	fileIndex int,
) bool {
	if snapshot == nil || status == nil || fileIndex < 0 || fileIndex >= len(status.Files) || fileIndex >= len(snapshot.Files) {
		return false
	}

	selected := status.Files[fileIndex]
	status.SelectedFileIndex = fileIndex
	status.SelectedFileBytesCompleted = selected.BytesCompleted
	status.SelectedFileLength = selected.Length

	status.SelectedFileReadyRatio = 0
	if selected.Length > 0 {
		status.SelectedFileReadyRatio = clampRatio(float64(selected.BytesCompleted) / float64(selected.Length))
	}

	contiguousBytes := playerTransmissionContiguousBytesFromStart(snapshot, fileIndex)
	status.SelectedFileContiguousBytes = contiguousBytes
	status.SelectedFileContiguousRatio = 0
	if selected.Length > 0 {
		status.SelectedFileContiguousRatio = clampRatio(float64(contiguousBytes) / float64(selected.Length))
	}
	status.SelectedFileAvailableRanges = playerTransmissionAvailableRanges(snapshot, fileIndex)
	status.SelectedFileDurationSeconds = 0
	return true
}

func (s *service) playerTransmissionEnrichStatusDuration(
	ctx context.Context,
	settings playerBootstrapSettings,
	snapshot *playerTransmissionRPCTorrent,
	status *PlayerTransmissionStatusResult,
) {
	if s == nil || snapshot == nil || status == nil {
		return
	}
	fileIndex := status.SelectedFileIndex
	if fileIndex < 0 || fileIndex >= len(snapshot.Files) || fileIndex >= len(status.Files) {
		return
	}
	selected := status.Files[fileIndex]
	if !selected.IsVideo || selected.Length <= 0 {
		return
	}

	completed := playerTransmissionFileFullyCompleted(snapshot, fileIndex)
	if !completed &&
		playerTransmissionContiguousBytesFromStart(snapshot, fileIndex) < minInt64(defaultPlayerStreamProbeChunkBytes, selected.Length) {
		return
	}

	filePath, err := s.playerTransmissionResolveLocalFilePath(ctx, settings, snapshot, fileIndex)
	if err != nil {
		return
	}
	duration := s.playerTransmissionCachedProbeDuration(ctx, settings.FFmpeg.BinaryPath, filePath, completed)
	if duration > 0 {
		status.SelectedFileDurationSeconds = duration
	}
}

func (s *service) playerTransmissionResolveLocalFilePath(
	ctx context.Context,
	settings playerBootstrapSettings,
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
) (string, error) {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return "", ErrPlayerFileNotFound
	}
	fileName := strings.TrimSpace(snapshot.Files[fileIndex].Name)
	dirCandidates := []string{strings.TrimSpace(snapshot.DownloadDir)}
	if targetPath, err := playerTransmissionResolveFilePath(
		dirCandidates[0],
		fileName,
		settings.TransmissionLocalDownloadDir,
	); err == nil {
		return targetPath, nil
	}

	if sessionDirs, sessionErr := s.playerTransmissionLoadSessionDirs(ctx, settings); sessionErr == nil {
		for _, sessionDir := range sessionDirs {
			trimmed := strings.TrimSpace(sessionDir)
			if trimmed == "" || strings.EqualFold(trimmed, strings.TrimSpace(snapshot.DownloadDir)) {
				continue
			}
			dirCandidates = append(dirCandidates, trimmed)
		}
	}

	var resolveErr error
	for _, dir := range dirCandidates {
		targetPath, err := playerTransmissionResolveFilePath(
			dir,
			fileName,
			settings.TransmissionLocalDownloadDir,
		)
		if err == nil {
			return targetPath, nil
		}
		resolveErr = err
	}
	if resolveErr == nil {
		resolveErr = ErrNotFound
	}
	return "", resolveErr
}

func (s *service) playerTransmissionCachedProbeDuration(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
	forceRetry bool,
) float64 {
	trimmedPath := strings.TrimSpace(filePath)
	if trimmedPath == "" {
		return 0
	}
	stat, err := os.Stat(trimmedPath)
	if err != nil || stat.IsDir() {
		return 0
	}

	cacheKey := trimmedPath
	now := time.Now()
	if cachedValue, ok := s.playerDurations.Load(cacheKey); ok {
		if cached, ok := cachedValue.(playerFileDurationCacheEntry); ok && cached.size == stat.Size() {
			if cached.durationSeconds > 0 {
				return cached.durationSeconds
			}
			if !forceRetry && cached.failed && now.Sub(cached.probedAt) < 60*time.Second {
				return 0
			}
		}
	}

	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	duration, err := playerTransmissionProbeDuration(probeCtx, ffmpegBinaryPath, trimmedPath)
	entry := playerFileDurationCacheEntry{
		durationSeconds: duration,
		size:            stat.Size(),
		probedAt:        now,
		failed:          err != nil || duration <= 0,
	}
	s.playerDurations.Store(cacheKey, entry)
	if err != nil || duration <= 0 {
		return 0
	}
	return duration
}

func (s *service) playerTransmissionCachedProbeVideoColor(
	ctx context.Context,
	ffmpegBinaryPath string,
	filePath string,
	forceRetry bool,
) PlayerVideoColorInfo {
	trimmedPath := strings.TrimSpace(filePath)
	if trimmedPath == "" {
		return PlayerVideoColorInfo{}
	}
	stat, err := os.Stat(trimmedPath)
	if err != nil || stat.IsDir() {
		return PlayerVideoColorInfo{}
	}

	cacheKey := trimmedPath
	now := time.Now()
	if cachedValue, ok := s.playerVideoColors.Load(cacheKey); ok {
		if cached, ok := cachedValue.(playerVideoColorCacheEntry); ok && cached.size == stat.Size() {
			if !cached.failed {
				return cached.color
			}
			if !forceRetry && now.Sub(cached.probedAt) < 60*time.Second {
				return PlayerVideoColorInfo{}
			}
		}
	}

	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	color, err := playerTransmissionProbeVideoColorInfo(probeCtx, ffmpegBinaryPath, trimmedPath)
	entry := playerVideoColorCacheEntry{
		color:    color,
		size:     stat.Size(),
		probedAt: now,
		failed:   err != nil,
	}
	s.playerVideoColors.Store(cacheKey, entry)
	if err != nil {
		return PlayerVideoColorInfo{}
	}
	return color
}

package media

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

func playerTransmissionRPCResultError(method, result string) error {
	result = strings.TrimSpace(result)
	if strings.EqualFold(result, "success") {
		return nil
	}
	return fmt.Errorf("transmission %s result=%q", method, result)
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
	if err := playerTransmissionRPCResultError("torrent-add", addResponse.Result); err != nil {
		return nil, err
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
	if err := playerTransmissionRPCResultError("torrent-get", response.Result); err != nil {
		return nil, err
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
				"name",
				"status",
				"percentDone",
				"error",
				"errorString",
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
		reqPayload,
	)
	if err != nil {
		return nil, err
	}

	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if err := playerTransmissionRPCResultError("torrent-get", response.Result); err != nil {
		return nil, err
	}

	result := make(map[string]playerTransmissionRPCTorrent, len(response.Arguments.Torrents))
	for _, item := range response.Arguments.Torrents {
		key := normalizePlayerInfoHashKey(item.HashString)
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
	snapshot *playerTransmissionRPCTorrent,
	startBytes int64,
) error {
	if snapshot == nil {
		return ErrPlayerFileNotFound
	}
	files := snapshot.Files
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

	args := playerTransmissionRPCArguments{
		IDs:            []any{infoHash},
		FilesWanted:    wanted,
		FilesUnwanted:  unwanted,
		PriorityHigh:   []int{fileIndex},
		PriorityNormal: priorityNormal,
		PriorityLow:    []int{},
		Sequential:     boolPtr(settings.TransmissionSequential),
	}
	if settings.TransmissionSequential {
		if piece, ok := playerTransmissionSequentialStartPiece(snapshot, fileIndex, startBytes); ok {
			args.SequentialFrom = &piece
		}
	}

	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method:    "torrent-set",
		Arguments: args,
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
	if err := playerTransmissionRPCResultError("torrent-set", response.Result); err != nil {
		return err
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
		if err := playerTransmissionRPCResultError(method, response.Result); err == nil {
			return nil
		} else {
			lastErr = err
		}
	}
	return lastErr
}

func playerTransmissionSequentialStartPiece(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
	startBytes int64,
) (int, bool) {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) || snapshot.PieceSize <= 0 {
		return 0, false
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength <= 0 {
		return 0, false
	}
	if startBytes < 0 {
		startBytes = 0
	}
	if startBytes >= fileLength {
		startBytes = fileLength - 1
	}
	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}
	piece := int((fileOffset + startBytes) / snapshot.PieceSize)
	if piece < 0 {
		return 0, false
	}
	return piece, true
}

package media

import (
	"context"
	"errors"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
)

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

func (s *service) playerTransmissionLoadStatus(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	includePieces bool,
) (PlayerTransmissionStatusResult, error) {
	return s.playerTransmissionLoadStatusForSelectedFile(ctx, settings, infoHash, includePieces, -1)
}

func (s *service) playerTransmissionLoadStatusForSelectedFile(
	ctx context.Context,
	settings playerBootstrapSettings,
	infoHash string,
	includePieces bool,
	selectedFileIndex int,
) (PlayerTransmissionStatusResult, error) {
	snapshot, err := s.playerTransmissionFetchTorrent(ctx, settings, infoHash, includePieces)
	if err != nil {
		return PlayerTransmissionStatusResult{}, err
	}
	result := playerTransmissionBuildStatus(infoHash, snapshot, settings.TransmissionDownloadVideoFormats)
	if selectedFileIndex < 0 {
		if remembered, ok := s.playerTransmissionRememberedSelectedFile(infoHash); ok {
			selectedFileIndex = remembered
		}
	}
	if selectedFileIndex >= 0 {
		playerTransmissionApplySelectedFileStatus(snapshot, &result, selectedFileIndex)
	}
	s.playerTransmissionEnrichStatusDuration(ctx, settings, snapshot, &result)
	return result, nil
}

func (s *service) playerTransmissionRememberSelectedFile(infoHash string, fileIndex int) {
	if s == nil || fileIndex < 0 {
		return
	}
	key := strings.TrimSpace(strings.ToLower(infoHash))
	if key == "" {
		return
	}
	s.playerSelections.Store(key, fileIndex)
}

func (s *service) playerTransmissionRememberedSelectedFile(infoHash string) (int, bool) {
	if s == nil {
		return 0, false
	}
	key := strings.TrimSpace(strings.ToLower(infoHash))
	if key == "" {
		return 0, false
	}
	value, ok := s.playerSelections.Load(key)
	if !ok {
		return 0, false
	}
	index, ok := value.(int)
	if !ok || index < 0 {
		s.playerSelections.Delete(key)
		return 0, false
	}
	return index, true
}

func (s *service) playerTransmissionForgetSelectedFiles(infoHashes []string) {
	if s == nil {
		return
	}
	for _, infoHash := range normalizePlayerInfoHashList(infoHashes) {
		s.playerSelections.Delete(infoHash)
	}
}

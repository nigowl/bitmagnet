package media

import (
	"context"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
)

func normalizePlayerInfoHashList(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, raw := range values {
		infoHash := strings.TrimSpace(strings.ToLower(raw))
		if infoHash == "" {
			continue
		}
		if _, err := protocol.ParseID(infoHash); err != nil {
			continue
		}
		if _, ok := seen[infoHash]; ok {
			continue
		}
		seen[infoHash] = struct{}{}
		result = append(result, infoHash)
	}
	return result
}

func (s *service) syncMediaCacheFlagsForInfoHashes(
	ctx context.Context,
	db *gorm.DB,
	settings playerBootstrapSettings,
	checkedInfoHashes []string,
	cachedSnapshots map[string]playerTransmissionRPCTorrent,
) {
	if db == nil || len(checkedInfoHashes) == 0 {
		return
	}

	normalized := normalizePlayerInfoHashList(checkedInfoHashes)
	if len(normalized) == 0 {
		return
	}

	checked := make(map[string]struct{}, len(normalized))
	parsedIDs := make([]protocol.ID, 0, len(normalized))
	for _, infoHash := range normalized {
		checked[infoHash] = struct{}{}
		parsed, err := protocol.ParseID(infoHash)
		if err != nil {
			continue
		}
		parsedIDs = append(parsedIDs, parsed)
	}
	if len(parsedIDs) == 0 {
		return
	}

	type mediaTorrentRow struct {
		MediaID  string      `gorm:"column:media_id"`
		InfoHash protocol.ID `gorm:"column:info_hash"`
	}
	var seedRows []mediaTorrentRow
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntryTorrent).
		Select("media_id, info_hash").
		Where("info_hash IN ?", parsedIDs).
		Find(&seedRows).Error; err != nil {
		return
	}
	if len(seedRows) == 0 {
		return
	}

	mediaIDs := make([]string, 0, len(seedRows))
	mediaSeen := make(map[string]struct{}, len(seedRows))
	for _, row := range seedRows {
		if strings.TrimSpace(row.MediaID) == "" {
			continue
		}
		if _, ok := mediaSeen[row.MediaID]; ok {
			continue
		}
		mediaSeen[row.MediaID] = struct{}{}
		mediaIDs = append(mediaIDs, row.MediaID)
	}
	if len(mediaIDs) == 0 {
		return
	}

	var rows []mediaTorrentRow
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntryTorrent).
		Select("media_id, info_hash").
		Where("media_id IN ?", mediaIDs).
		Find(&rows).Error; err != nil {
		return
	}
	if len(rows) == 0 {
		return
	}

	mediaByHash := make(map[string][]string, len(rows))
	allHashes := make([]string, 0, len(rows))
	allSeen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		infoHash := strings.TrimSpace(strings.ToLower(row.InfoHash.String()))
		if infoHash == "" {
			continue
		}
		mediaByHash[infoHash] = append(mediaByHash[infoHash], row.MediaID)
		if _, ok := allSeen[infoHash]; ok {
			continue
		}
		allSeen[infoHash] = struct{}{}
		allHashes = append(allHashes, infoHash)
	}
	if len(allHashes) == 0 {
		return
	}

	cachedByHash := make(map[string]struct{}, len(cachedSnapshots))
	for infoHash := range cachedSnapshots {
		normalizedHash := strings.TrimSpace(strings.ToLower(infoHash))
		if normalizedHash != "" {
			cachedByHash[normalizedHash] = struct{}{}
			checked[normalizedHash] = struct{}{}
		}
	}

	missing := make([]string, 0)
	for _, infoHash := range allHashes {
		if _, ok := checked[infoHash]; ok {
			continue
		}
		missing = append(missing, infoHash)
	}
	if len(missing) > 0 {
		if snapshots, err := s.playerTransmissionFetchTorrents(ctx, settings, missing); err == nil {
			for infoHash := range snapshots {
				normalizedHash := strings.TrimSpace(strings.ToLower(infoHash))
				if normalizedHash != "" {
					cachedByHash[normalizedHash] = struct{}{}
				}
			}
		}
	}

	cachedByMedia := make(map[string]bool, len(mediaIDs))
	for _, mediaID := range mediaIDs {
		cachedByMedia[mediaID] = false
	}
	for infoHash, mappedMediaIDs := range mediaByHash {
		if _, ok := cachedByHash[infoHash]; !ok {
			continue
		}
		for _, mediaID := range mappedMediaIDs {
			cachedByMedia[mediaID] = true
		}
	}

	now := time.Now()
	for mediaID, hasCache := range cachedByMedia {
		_ = db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", mediaID).
			Where("has_cache IS DISTINCT FROM ? OR cache_updated_at IS NULL", hasCache).
			Updates(map[string]any{
				"has_cache":        hasCache,
				"cache_updated_at": now,
			}).Error
	}
}

package media

import (
	"context"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/media/siteplugins"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

func (s *service) BackfillLocalizedMetadata(ctx context.Context, input BackfillLocalizedInput) (BackfillLocalizedResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return BackfillLocalizedResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	startedAt := time.Now()

	var rows []model.MediaEntry
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return BackfillLocalizedResult{}, err
	}

	result := BackfillLocalizedResult{
		Requested: len(rows),
	}
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: 0,
			Updated:   0,
		})
	}

	for _, row := range rows {
		result.Processed++
		beforeReady := hasBilingualOverviewAndTitle(row)

		enriched := s.sitePluginManager.Enrich(ctx, db, row, siteplugins.EnrichOptions{
			Force:      true,
			PluginKeys: []string{model.SourceTmdb},
		})

		if err := enrichStructuredMetadata(ctx, db, []string{enriched.ID}); err != nil {
			continue
		}

		var refreshed model.MediaEntry
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", enriched.ID).
			Take(&refreshed).Error; err != nil {
			continue
		}

		afterReady := hasBilingualOverviewAndTitle(refreshed)
		if afterReady && !beforeReady {
			result.Updated++
		}
		if input.Progress != nil {
			input.Progress(BackfillProgressInfo{
				Requested: result.Requested,
				Processed: result.Processed,
				Updated:   result.Updated,
				CurrentID: row.ID,
			})
		}
	}

	var remaining int64
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
		Count(&remaining).Error; err == nil {
		result.Remaining = int(remaining)
	}
	result.DurationMs = time.Since(startedAt).Milliseconds()
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: result.Processed,
			Updated:   result.Updated,
			Remaining: result.Remaining,
		})
	}

	return result, nil
}

func (s *service) BackfillCoverCache(ctx context.Context, input BackfillCoverCacheInput) (BackfillCoverCacheResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return BackfillCoverCacheResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	startedAt := time.Now()

	rows, err := s.loadPendingCoverEntries(ctx, db, limit)
	if err != nil {
		return BackfillCoverCacheResult{}, err
	}

	result := BackfillCoverCacheResult{
		Requested: len(rows),
	}
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: 0,
			Updated:   0,
			Message:   "cover cache backfill started",
		})
	}

	for _, row := range rows {
		entryUpdated := false
		result.Processed++

		if strings.TrimSpace(row.PosterPath.String) != "" {
			if s.entryNeedsCoverCacheKind(row.ID, coverKindPoster, row.PosterPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, row.ID, coverKindPoster, coverSizeMD, row.PosterPath.String); resolveErr != nil {
					result.Failed++
				} else {
					entryUpdated = true
				}
			}
		}

		if strings.TrimSpace(row.BackdropPath.String) != "" {
			if s.entryNeedsCoverCacheKind(row.ID, coverKindBackdrop, row.BackdropPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, row.ID, coverKindBackdrop, coverSizeMD, row.BackdropPath.String); resolveErr != nil {
					result.Failed++
				} else {
					entryUpdated = true
				}
			}
		}

		if entryUpdated {
			result.Updated++
		}

		if input.Progress != nil {
			input.Progress(BackfillProgressInfo{
				Requested: result.Requested,
				Processed: result.Processed,
				Updated:   result.Updated,
				CurrentID: row.ID,
			})
		}
	}

	if remaining, countErr := s.countPendingCoverCacheWithDB(ctx, db); countErr == nil {
		result.Remaining = remaining
	}
	result.DurationMs = time.Since(startedAt).Milliseconds()
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: result.Processed,
			Updated:   result.Updated,
			Remaining: result.Remaining,
			Message:   "cover cache backfill completed",
		})
	}

	return result, nil
}

func (s *service) CountPendingLocalizedMetadata(ctx context.Context) (int, error) {
	q, err := s.dao.Get()
	if err != nil {
		return 0, err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	var count int64
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
		Count(&count).Error; err != nil {
		return 0, err
	}

	return int(count), nil
}

func (s *service) CountPendingCoverCache(ctx context.Context) (int, error) {
	q, err := s.dao.Get()
	if err != nil {
		return 0, err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	return s.countPendingCoverCacheWithDB(ctx, db)
}

func hasBilingualOverviewAndTitle(entry model.MediaEntry) bool {
	return strings.TrimSpace(entry.NameZh.String) != "" &&
		strings.TrimSpace(entry.OverviewZh.String) != "" &&
		strings.TrimSpace(entry.NameEn.String) != "" &&
		strings.TrimSpace(entry.OverviewEn.String) != ""
}

func localizedPendingScope(db *gorm.DB) *gorm.DB {
	return db.Where("torrent_count > 0").
		Where("content_source = ?", model.SourceTmdb).
		Where("content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow}).
		Where(`coalesce(name_zh, '') = ''
			OR coalesce(overview_zh, '') = ''
			OR coalesce(name_en, '') = ''
			OR coalesce(overview_en, '') = ''`)
}

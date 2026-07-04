package media

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const coverFailureRetryTTL = 2 * time.Minute
const coverFailureNotFoundTTL = 6 * time.Hour

func (s *service) loadPendingCoverEntries(ctx context.Context, db *gorm.DB, limit int) ([]model.MediaEntry, error) {
	candidates, err := s.loadCoverCacheCandidates(ctx, db)
	if err != nil {
		return nil, err
	}

	capacity := len(candidates)
	if limit < capacity {
		capacity = limit
	}
	entries := make([]model.MediaEntry, 0, capacity)
	for _, row := range candidates {
		if !s.entryNeedsCoverCache(row) {
			continue
		}
		entries = append(entries, row)
		if len(entries) >= limit {
			break
		}
	}

	return entries, nil
}

func (s *service) loadCoverCacheCandidates(ctx context.Context, db *gorm.DB) ([]model.MediaEntry, error) {
	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("torrent_count > 0").
		Where(`coalesce(poster_path, '') <> '' OR coalesce(backdrop_path, '') <> ''`).
		Order("updated_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *service) countPendingCoverCacheWithDB(ctx context.Context, db *gorm.DB) (int, error) {
	candidates, err := s.loadCoverCacheCandidates(ctx, db)
	if err != nil {
		return 0, err
	}

	pending := 0
	for _, row := range candidates {
		if s.entryNeedsCoverCache(row) {
			pending++
		}
	}
	return pending, nil
}

func (s *service) entryNeedsCoverCache(entry model.MediaEntry) bool {
	return s.entryNeedsCoverCacheKind(entry.ID, coverKindPoster, entry.PosterPath.String) ||
		s.entryNeedsCoverCacheKind(entry.ID, coverKindBackdrop, entry.BackdropPath.String)
}

func coverSourcePath(entry model.MediaEntry, kind coverKind) string {
	switch kind {
	case coverKindPoster:
		return strings.TrimSpace(entry.PosterPath.String)
	case coverKindBackdrop:
		return strings.TrimSpace(entry.BackdropPath.String)
	default:
		return ""
	}
}

func (s *service) loadCoverSourcePath(
	ctx context.Context,
	db *gorm.DB,
	mediaID string,
	kind coverKind,
) (string, error) {
	entry, err := s.loadOrCreateMediaEntry(ctx, db, mediaID)
	if err != nil {
		return "", err
	}
	return coverSourcePath(entry, kind), nil
}

func (s *service) entryNeedsCoverCacheKind(mediaID string, kind coverKind, sourcePath string) bool {
	if strings.TrimSpace(sourcePath) == "" {
		return false
	}
	cachePath := s.coverCache.variantPath(mediaID, kind, coverSizeMD)
	return !fileExists(cachePath)
}

func (s *service) Cover(ctx context.Context, id string, kind string, size string) (CoverResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return CoverResult{}, err
	}

	mediaID := strings.TrimSpace(id)
	if mediaID == "" {
		return CoverResult{}, ErrNotFound
	}

	coverKindValue, err := parseCoverKind(kind)
	if err != nil {
		return CoverResult{}, ErrCoverNotFound
	}

	coverSizeValue, err := parseCoverSize(size)
	if err != nil {
		return CoverResult{}, ErrCoverNotFound
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	sourcePath, err := s.loadCoverSourcePath(ctx, db, mediaID, coverKindValue)
	if err != nil {
		return CoverResult{}, err
	}
	if sourcePath == "" {
		return CoverResult{}, ErrCoverNotFound
	}

	filePath := s.coverCache.variantPath(mediaID, coverKindValue, coverSizeValue)
	if fileExists(filePath) {
		return CoverResult{FilePath: filePath}, nil
	}

	failureKey := coverFailureKey(mediaID, coverKindValue, sourcePath)
	if status, blocked := s.coverFailureStatus(failureKey); blocked {
		if status.notFound {
			return CoverResult{}, ErrCoverNotFound
		}
		return CoverResult{Pending: true}, nil
	}

	if err := s.enqueueCoverGeneration(ctx, mediaID, coverKindValue, coverSizeValue, sourcePath); err != nil {
		return CoverResult{}, err
	}

	return CoverResult{Pending: true}, nil
}

func (s *service) GenerateCover(ctx context.Context, input GenerateCoverInput) error {
	mediaID := strings.TrimSpace(input.MediaID)
	if mediaID == "" {
		return nil
	}

	coverKindValue, err := parseCoverKind(input.Kind)
	if err != nil {
		return nil
	}

	coverSizeValue, err := parseCoverSize(input.Size)
	if err != nil {
		return nil
	}

	sourcePath := strings.TrimSpace(input.SourcePath)
	if sourcePath == "" {
		q, daoErr := s.dao.Get()
		if daoErr != nil {
			return daoErr
		}

		db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
		sourcePath, err = s.loadCoverSourcePath(ctx, db, mediaID, coverKindValue)
		if err != nil {
			return err
		}
	}

	if sourcePath == "" {
		return ErrCoverNotFound
	}

	remoteURL := s.coverCache.sourceURL(sourcePath)
	if s.logger != nil {
		s.logger.Info("cover queue job started",
			zap.String("media_id", mediaID),
			zap.String("kind", string(coverKindValue)),
			zap.String("size", string(coverSizeValue)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", remoteURL),
			zap.Bool("cache_all_variants", true),
		)
	}

	_, err = s.coverCache.resolvePath(ctx, mediaID, coverKindValue, coverSizeValue, sourcePath)
	if err != nil {
		failureKey := coverFailureKey(mediaID, coverKindValue, sourcePath)
		if errors.Is(err, ErrCoverNotFound) {
			s.rememberCoverFailure(failureKey, true)
			if s.logger != nil {
				s.logger.Info("cover queue job finished without source image",
					zap.String("media_id", mediaID),
					zap.String("kind", string(coverKindValue)),
					zap.String("size", string(coverSizeValue)),
					zap.String("source_path", sourcePath),
					zap.String("source_url", remoteURL),
					zap.Bool("cache_all_variants", true),
				)
			}
			return nil
		}
		s.rememberCoverFailure(failureKey, false)
		if s.logger != nil {
			s.logger.Error("cover queue job failed",
				zap.String("media_id", mediaID),
				zap.String("kind", string(coverKindValue)),
				zap.String("size", string(coverSizeValue)),
				zap.String("source_path", sourcePath),
				zap.String("source_url", remoteURL),
				zap.Bool("cache_all_variants", true),
				zap.Error(err),
			)
		}
		return err
	}

	s.clearCoverFailure(coverFailureKey(mediaID, coverKindValue, sourcePath))
	if s.logger != nil {
		s.logger.Info("cover queue job completed",
			zap.String("media_id", mediaID),
			zap.String("kind", string(coverKindValue)),
			zap.String("size", string(coverSizeValue)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", remoteURL),
			zap.Bool("cache_all_variants", true),
		)
	}

	return nil
}

func (s *service) enqueueCoverGeneration(ctx context.Context, mediaID string, kind coverKind, requestedSize coverSize, sourcePath string) error {
	q, err := s.dao.Get()
	if err != nil {
		return err
	}

	// One queue job renders all cover variants, so we normalize to XL to avoid
	// duplicate jobs for the same media/kind requested at different sizes.
	queueSize := coverSizeXL
	job, err := NewGenerateCoverQueueJob(mediaID, kind, queueSize, sourcePath)
	if err != nil {
		return err
	}

	tx := q.QueueJob.WithContext(ctx).Clauses(clause.OnConflict{
		DoNothing: true,
	}).UnderlyingDB().Create(&job)
	if tx.Error != nil {
		return tx.Error
	}

	if s.logger != nil {
		s.logger.Info("cover queue job enqueued",
			zap.String("media_id", mediaID),
			zap.String("kind", string(kind)),
			zap.String("requested_size", string(requestedSize)),
			zap.String("queue_size", string(queueSize)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", s.coverCache.sourceURL(sourcePath)),
			zap.Bool("duplicate", tx.RowsAffected == 0),
		)
	}

	return nil
}

type coverFailureStatusInfo struct {
	retryAfter time.Time
	notFound   bool
}

func coverFailureKey(mediaID string, kind coverKind, sourcePath string) string {
	return strings.Join([]string{
		strings.TrimSpace(mediaID),
		string(kind),
		strings.TrimSpace(sourcePath),
	}, "|")
}

func (s *service) coverFailureStatus(key string) (coverFailureStatusInfo, bool) {
	now := time.Now()
	value, ok := s.coverFailures.Load(key)
	if !ok {
		return coverFailureStatusInfo{}, false
	}

	status, ok := value.(coverFailureStatusInfo)
	if !ok {
		s.coverFailures.Delete(key)
		return coverFailureStatusInfo{}, false
	}

	if now.After(status.retryAfter) {
		s.coverFailures.Delete(key)
		return coverFailureStatusInfo{}, false
	}

	return status, true
}

func (s *service) rememberCoverFailure(key string, notFound bool) {
	ttl := coverFailureRetryTTL
	if notFound {
		ttl = coverFailureNotFoundTTL
	}

	s.coverFailures.Store(key, coverFailureStatusInfo{
		retryAfter: time.Now().Add(ttl),
		notFound:   notFound,
	})
}

func (s *service) clearCoverFailure(key string) {
	s.coverFailures.Delete(key)
}

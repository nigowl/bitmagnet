package media

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
)

const playerSubtitleMaxContentBytes = 2 * 1024 * 1024

func normalizePlayerSubtitleInfoHash(raw string) (string, error) {
	infoHash := strings.TrimSpace(strings.ToLower(raw))
	if infoHash == "" {
		return "", ErrInvalidInfoHash
	}
	if _, err := protocol.ParseID(infoHash); err != nil {
		return "", ErrInvalidInfoHash
	}
	return infoHash, nil
}

func normalizePlayerSubtitleLanguage(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		return "und"
	}
	if len(value) > 16 {
		return value[:16]
	}
	return value
}

func normalizePlayerSubtitleLabel(raw string) (string, error) {
	label := strings.TrimSpace(raw)
	if label == "" {
		return "", ErrPlayerSubtitleInvalid
	}
	if len(label) > 180 {
		label = label[:180]
	}
	return label, nil
}

func normalizePlayerSubtitleVTT(raw string) (string, error) {
	content := strings.TrimSpace(raw)
	if content == "" {
		return "", ErrPlayerSubtitleInvalid
	}
	if !strings.HasPrefix(strings.ToUpper(content), "WEBVTT") {
		content = "WEBVTT\n\n" + content
	}
	if len(content) > playerSubtitleMaxContentBytes {
		return "", ErrPlayerSubtitleInvalid
	}
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return content, nil
}

func normalizePlayerSubtitleOffsetSeconds(raw float64) (float64, error) {
	if math.IsNaN(raw) || math.IsInf(raw, 0) {
		return 0, ErrPlayerSubtitleInvalid
	}
	if raw > 300 || raw < -300 {
		return 0, ErrPlayerSubtitleInvalid
	}
	return raw, nil
}

func mapPlayerSubtitleRecord(record model.PlayerSubtitle) PlayerSubtitle {
	return PlayerSubtitle{
		ID:            record.ID,
		InfoHash:      record.InfoHash,
		Label:         record.Label,
		Language:      record.Language,
		OffsetSeconds: record.OffsetSeconds,
		CreatedAt:     record.CreatedAt,
		UpdatedAt:     record.UpdatedAt,
	}
}

func (s *service) playerSubtitleDB(ctx context.Context) (*gorm.DB, error) {
	q, err := s.dao.Get()
	if err != nil {
		return nil, err
	}
	return q.WriteDB().
		UnderlyingDB().
		Session(&gorm.Session{NewDB: true}).
		WithContext(ctx), nil
}

func (s *service) ensurePlayerEnabled(ctx context.Context, db *gorm.DB) error {
	settings, err := s.loadPlayerBootstrapSettings(ctx, db)
	if err != nil {
		return err
	}
	if !settings.PlayerEnabled {
		return ErrPlayerDisabled
	}
	return nil
}

func (s *service) PlayerSubtitleList(ctx context.Context, input PlayerSubtitleListInput) ([]PlayerSubtitle, error) {
	infoHash, err := normalizePlayerSubtitleInfoHash(input.InfoHash)
	if err != nil {
		return nil, err
	}
	db, err := s.playerSubtitleDB(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.ensurePlayerEnabled(ctx, db); err != nil {
		return nil, err
	}

	var records []model.PlayerSubtitle
	if err := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Where("info_hash = ?", infoHash).
		Order("updated_at desc, id desc").
		Find(&records).Error; err != nil {
		return nil, err
	}

	result := make([]PlayerSubtitle, 0, len(records))
	for _, record := range records {
		result = append(result, mapPlayerSubtitleRecord(record))
	}
	return result, nil
}

func (s *service) PlayerSubtitleCreate(ctx context.Context, input PlayerSubtitleCreateInput) (PlayerSubtitle, error) {
	infoHash, err := normalizePlayerSubtitleInfoHash(input.InfoHash)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	label, err := normalizePlayerSubtitleLabel(input.Label)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	contentVTT, err := normalizePlayerSubtitleVTT(input.ContentVTT)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	db, err := s.playerSubtitleDB(ctx)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	if err := s.ensurePlayerEnabled(ctx, db); err != nil {
		return PlayerSubtitle{}, err
	}

	now := time.Now().UTC()
	record := model.PlayerSubtitle{
		InfoHash:      infoHash,
		Label:         label,
		Language:      normalizePlayerSubtitleLanguage(input.Language),
		OffsetSeconds: 0,
		ContentVTT:    contentVTT,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Create(&record).Error; err != nil {
		return PlayerSubtitle{}, err
	}
	return mapPlayerSubtitleRecord(record), nil
}

func (s *service) PlayerSubtitleUpdate(ctx context.Context, input PlayerSubtitleUpdateInput) (PlayerSubtitle, error) {
	infoHash, err := normalizePlayerSubtitleInfoHash(input.InfoHash)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	if input.ID <= 0 {
		return PlayerSubtitle{}, ErrPlayerSubtitleInvalid
	}
	db, err := s.playerSubtitleDB(ctx)
	if err != nil {
		return PlayerSubtitle{}, err
	}
	if err := s.ensurePlayerEnabled(ctx, db); err != nil {
		return PlayerSubtitle{}, err
	}

	var record model.PlayerSubtitle
	if err := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Where("id = ? AND info_hash = ?", input.ID, infoHash).
		Take(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return PlayerSubtitle{}, ErrPlayerSubtitleNotFound
		}
		return PlayerSubtitle{}, err
	}

	updates := map[string]any{
		"updated_at": time.Now().UTC(),
	}
	if input.Label != nil {
		label, normalizeErr := normalizePlayerSubtitleLabel(*input.Label)
		if normalizeErr != nil {
			return PlayerSubtitle{}, normalizeErr
		}
		updates["label"] = label
	}
	if input.Language != nil {
		updates["language"] = normalizePlayerSubtitleLanguage(*input.Language)
	}
	if input.OffsetSeconds != nil {
		offsetSeconds, normalizeErr := normalizePlayerSubtitleOffsetSeconds(*input.OffsetSeconds)
		if normalizeErr != nil {
			return PlayerSubtitle{}, normalizeErr
		}
		updates["offset_seconds"] = offsetSeconds
	}

	if len(updates) > 1 {
		if err := db.WithContext(ctx).
			Table(model.TableNamePlayerSubtitle).
			Where("id = ? AND info_hash = ?", input.ID, infoHash).
			Updates(updates).Error; err != nil {
			return PlayerSubtitle{}, err
		}
	}

	if err := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Where("id = ? AND info_hash = ?", input.ID, infoHash).
		Take(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return PlayerSubtitle{}, ErrPlayerSubtitleNotFound
		}
		return PlayerSubtitle{}, err
	}
	return mapPlayerSubtitleRecord(record), nil
}

func (s *service) PlayerSubtitleDelete(ctx context.Context, input PlayerSubtitleDeleteInput) error {
	infoHash, err := normalizePlayerSubtitleInfoHash(input.InfoHash)
	if err != nil {
		return err
	}
	if input.ID <= 0 {
		return ErrPlayerSubtitleInvalid
	}
	db, err := s.playerSubtitleDB(ctx)
	if err != nil {
		return err
	}
	if err := s.ensurePlayerEnabled(ctx, db); err != nil {
		return err
	}
	result := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Where("id = ? AND info_hash = ?", input.ID, infoHash).
		Delete(&model.PlayerSubtitle{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPlayerSubtitleNotFound
	}
	return nil
}

func (s *service) PlayerSubtitleContent(ctx context.Context, input PlayerSubtitleContentInput) (PlayerSubtitleContentResult, error) {
	infoHash, err := normalizePlayerSubtitleInfoHash(input.InfoHash)
	if err != nil {
		return PlayerSubtitleContentResult{}, err
	}
	if input.ID <= 0 {
		return PlayerSubtitleContentResult{}, ErrPlayerSubtitleInvalid
	}
	db, err := s.playerSubtitleDB(ctx)
	if err != nil {
		return PlayerSubtitleContentResult{}, err
	}
	if err := s.ensurePlayerEnabled(ctx, db); err != nil {
		return PlayerSubtitleContentResult{}, err
	}

	var record model.PlayerSubtitle
	if err := db.WithContext(ctx).
		Table(model.TableNamePlayerSubtitle).
		Select("id", "info_hash", "content_vtt", "updated_at").
		Where("id = ? AND info_hash = ?", input.ID, infoHash).
		Take(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return PlayerSubtitleContentResult{}, ErrPlayerSubtitleNotFound
		}
		return PlayerSubtitleContentResult{}, err
	}

	return PlayerSubtitleContentResult{
		ContentVTT: record.ContentVTT,
		UpdatedAt:  record.UpdatedAt,
	}, nil
}

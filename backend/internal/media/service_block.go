package media

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *service) Block(ctx context.Context, userID int64, mediaID string) error {
	if userID <= 0 || strings.TrimSpace(mediaID) == "" {
		return ErrNotFound
	}
	q, err := s.dao.Get()
	if err != nil {
		return err
	}
	db := q.WriteDB().UnderlyingDB().Session(&gorm.Session{NewDB: true}).WithContext(ctx)
	if err := ensureMediaEntryExists(ctx, db, mediaID); err != nil {
		return err
	}
	block := model.UserMediaBlock{
		UserID:    userID,
		MediaID:   strings.TrimSpace(mediaID),
		CreatedAt: time.Now(),
	}
	return db.Table(model.TableNameUserMediaBlock).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&block).Error
}

func (s *service) Unblock(ctx context.Context, userID int64, mediaID string) error {
	if userID <= 0 || strings.TrimSpace(mediaID) == "" {
		return ErrNotFound
	}
	q, err := s.dao.Get()
	if err != nil {
		return err
	}
	return q.WriteDB().UnderlyingDB().Session(&gorm.Session{NewDB: true}).WithContext(ctx).
		Table(model.TableNameUserMediaBlock).
		Where("user_id = ? AND media_id = ?", userID, strings.TrimSpace(mediaID)).
		Delete(&model.UserMediaBlock{}).Error
}

func (s *service) isBlocked(ctx context.Context, db *gorm.DB, userID int64, mediaID string) bool {
	var count int64
	if err := db.Session(&gorm.Session{NewDB: true}).WithContext(ctx).
		Table(model.TableNameUserMediaBlock).
		Where("user_id = ? AND media_id = ?", userID, mediaID).
		Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func ensureMediaEntryExists(ctx context.Context, db *gorm.DB, mediaID string) error {
	var row struct {
		ID string
	}
	err := db.WithContext(ctx).Table(model.TableNameMediaEntry).
		Select("id").
		Where("id = ?", strings.TrimSpace(mediaID)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}

package media

import (
	"context"
	"errors"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

func (s *service) loadOrCreateMediaEntry(ctx context.Context, db *gorm.DB, mediaID string) (model.MediaEntry, error) {
	var entry model.MediaEntry
	err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id = ?", mediaID).
		Take(&entry).Error
	if err == nil {
		return entry, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return model.MediaEntry{}, err
	}

	ref, lookupErr := lookupContentRefByMediaID(ctx, db, mediaID)
	if lookupErr != nil {
		return model.MediaEntry{}, lookupErr
	}

	if syncErr := SyncEntries(ctx, db, []model.ContentRef{ref}); syncErr != nil {
		return model.MediaEntry{}, syncErr
	}

	err = db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id = ?", mediaID).
		Take(&entry).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.MediaEntry{}, ErrNotFound
		}
		return model.MediaEntry{}, err
	}

	return entry, nil
}

func lookupContentRefByMediaID(ctx context.Context, db *gorm.DB, mediaID string) (model.ContentRef, error) {
	type mediaRefRow struct {
		ContentType   string
		ContentSource string
		ContentID     string
	}

	var row mediaRefRow
	err := db.WithContext(ctx).
		Table(model.TableNameTorrentContent+" tc").
		Select("tc.content_type", "tc.content_source", "tc.content_id").
		Where("md5(tc.content_type || ':' || tc.content_source || ':' || tc.content_id) = ?", mediaID).
		Where("tc.content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow}).
		Where("tc.content_source IS NOT NULL AND tc.content_id IS NOT NULL").
		Order("tc.updated_at DESC").
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.ContentRef{}, ErrNotFound
		}
		return model.ContentRef{}, err
	}

	contentType, parseErr := model.ParseContentType(row.ContentType)
	if parseErr != nil {
		return model.ContentRef{}, ErrNotFound
	}

	return model.ContentRef{
		Type:   contentType,
		Source: row.ContentSource,
		ID:     row.ContentID,
	}, nil
}

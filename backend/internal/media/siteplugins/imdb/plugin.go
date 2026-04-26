package imdb

import (
	"context"
	"strings"
	"time"
	"unicode"

	"github.com/nigowl/bitmagnet/internal/model"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Plugin struct {
	logger *zap.Logger
}

func NewWithLogger(logger *zap.Logger) *Plugin {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Plugin{logger: logger}
}

func (p *Plugin) Key() string {
	return model.SourceImdb
}

func (p *Plugin) Enrich(ctx context.Context, db *gorm.DB, entry model.MediaEntry) (bool, error) {
	id := ""

	if entry.ContentSource == model.SourceImdb {
		id = normalizeIMDbID(entry.ContentID)
	} else if entry.IMDbID.Valid {
		id = normalizeIMDbID(entry.IMDbID.String)
	}

	if id == "" {
		if p != nil && p.logger != nil {
			p.logger.Debug("skip imdb plugin: empty imdb id", zap.String("mediaID", entry.ID), zap.String("contentSource", entry.ContentSource))
		}
		return false, nil
	}
	if p != nil && p.logger != nil {
		p.logger.Debug("imdb plugin enrich start", zap.String("mediaID", entry.ID), zap.String("imdbID", id), zap.String("contentType", entry.ContentType.String()))
	}

	now := time.Now()
	if err := db.WithContext(ctx).
		Table(model.TableNameMetadataSource).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "updated_at"}),
		}).
		Create(&model.MetadataSource{
			Key:       model.SourceImdb,
			Name:      "IMDb",
			CreatedAt: now,
			UpdatedAt: now,
		}).Error; err != nil {
		if p != nil && p.logger != nil {
			p.logger.Warn("imdb plugin metadata source upsert failed", zap.String("mediaID", entry.ID), zap.Error(err))
		}
		return false, nil
	}

	attr := model.ContentAttribute{
		ContentType:   entry.ContentType,
		ContentSource: entry.ContentSource,
		ContentID:     entry.ContentID,
		Source:        model.SourceImdb,
		Key:           "id",
		Value:         id,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := db.WithContext(ctx).
		Table(model.TableNameContentAttribute).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "content_type"},
				{Name: "content_source"},
				{Name: "content_id"},
				{Name: "source"},
				{Name: "key"},
			},
			DoUpdates: clause.Assignments(map[string]any{
				"value":      attr.Value,
				"updated_at": now,
			}),
		}).
		Create(&attr).Error; err != nil {
		if p != nil && p.logger != nil {
			p.logger.Warn("imdb plugin attribute upsert failed", zap.String("mediaID", entry.ID), zap.String("imdbID", id), zap.Error(err))
		}
		return false, nil
	}
	if p != nil && p.logger != nil {
		p.logger.Debug("imdb plugin enrich success", zap.String("mediaID", entry.ID), zap.String("imdbID", id), zap.String("outputKey", "id"), zap.String("outputValue", id))
	}

	return true, nil
}

func normalizeIMDbID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	if strings.HasPrefix(strings.ToLower(value), "tt") {
		return "tt" + digitsOnly(value[2:])
	}

	digits := digitsOnly(value)
	if digits == "" {
		return ""
	}
	return "tt" + digits
}

func digitsOnly(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

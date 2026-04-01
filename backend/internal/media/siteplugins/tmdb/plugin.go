package tmdb

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/model"
	tmdbapi "github.com/nigowl/bitmagnet/internal/tmdb"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Plugin struct {
	logger     *zap.Logger
	tmdbClient lazy.Lazy[tmdbapi.Client]
}

func New() *Plugin {
	return &Plugin{logger: zap.NewNop()}
}

func NewWithLogger(logger *zap.Logger) *Plugin {
	return NewWithDeps(nil, logger)
}

func NewWithDeps(tmdbClient lazy.Lazy[tmdbapi.Client], logger *zap.Logger) *Plugin {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Plugin{
		logger:     logger,
		tmdbClient: tmdbClient,
	}
}

func (p *Plugin) Key() string {
	return model.SourceTmdb
}

func (p *Plugin) Enrich(ctx context.Context, db *gorm.DB, entry model.MediaEntry) (bool, error) {
	if entry.ContentSource != model.SourceTmdb {
		if p != nil && p.logger != nil {
			p.logger.Debug("skip tmdb plugin: content source mismatch", zap.String("mediaID", entry.ID), zap.String("contentSource", entry.ContentSource))
		}
		return false, nil
	}

	id := strings.TrimSpace(entry.ContentID)
	if id == "" {
		if p != nil && p.logger != nil {
			p.logger.Debug("skip tmdb plugin: empty content id", zap.String("mediaID", entry.ID))
		}
		return false, nil
	}
	if p != nil && p.logger != nil {
		p.logger.Debug("tmdb plugin enrich start", zap.String("mediaID", entry.ID), zap.String("tmdbID", id), zap.String("contentType", entry.ContentType.String()))
	}

	now := time.Now()
	if err := db.WithContext(ctx).
		Table(model.TableNameMetadataSource).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "updated_at"}),
		}).
		Create(&model.MetadataSource{
			Key:       model.SourceTmdb,
			Name:      "TMDB",
			CreatedAt: now,
			UpdatedAt: now,
		}).Error; err != nil {
		if p != nil && p.logger != nil {
			p.logger.Warn("tmdb plugin metadata source upsert failed", zap.String("mediaID", entry.ID), zap.Error(err))
		}
		return false, nil
	}

	attributes := []model.ContentAttribute{
		{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceTmdb,
			Key:           "id",
			Value:         id,
			CreatedAt:     now,
			UpdatedAt:     now,
		},
	}

	localized, localizedErr := p.fetchLocalizedText(ctx, entry.ContentType, id)
	if localizedErr != nil {
		if p != nil && p.logger != nil {
			p.logger.Debug("tmdb plugin localized metadata fetch failed", zap.String("mediaID", entry.ID), zap.String("tmdbID", id), zap.Error(localizedErr))
		}
	}

	if localized.TitleEN != "" {
		attributes = append(attributes, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceTmdb,
			Key:           "title_en",
			Value:         localized.TitleEN,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	if localized.TitleZH != "" {
		attributes = append(attributes, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceTmdb,
			Key:           "title_zh",
			Value:         localized.TitleZH,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	if localized.OverviewEN != "" {
		attributes = append(attributes, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceTmdb,
			Key:           "overview_en",
			Value:         localized.OverviewEN,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	if localized.OverviewZH != "" {
		attributes = append(attributes, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceTmdb,
			Key:           "overview_zh",
			Value:         localized.OverviewZH,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}

	for _, attr := range attributes {
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
				p.logger.Warn("tmdb plugin attribute upsert failed", zap.String("mediaID", entry.ID), zap.String("tmdbID", id), zap.String("key", attr.Key), zap.Error(err))
			}
			return false, nil
		}
	}

	mediaEntryUpdates := map[string]any{
		"updated_at": now,
	}
	if localized.TitleEN != "" {
		mediaEntryUpdates["name_en"] = localized.TitleEN
	}
	if localized.TitleZH != "" {
		mediaEntryUpdates["name_zh"] = localized.TitleZH
	}
	if localized.OverviewEN != "" {
		mediaEntryUpdates["overview_en"] = localized.OverviewEN
	}
	if localized.OverviewZH != "" {
		mediaEntryUpdates["overview_zh"] = localized.OverviewZH
	}

	if len(mediaEntryUpdates) > 1 {
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", entry.ID).
			Updates(mediaEntryUpdates).Error; err != nil {
			if p != nil && p.logger != nil {
				p.logger.Warn("tmdb plugin media entry update failed", zap.String("mediaID", entry.ID), zap.String("tmdbID", id), zap.Error(err))
			}
			return false, nil
		}
	}
	if p != nil && p.logger != nil {
		p.logger.Debug(
			"tmdb plugin enrich success",
			zap.String("mediaID", entry.ID),
			zap.String("tmdbID", id),
			zap.String("outputKey", "id"),
			zap.String("outputValue", id),
			zap.String("titleEN", localized.TitleEN),
			zap.String("titleZH", localized.TitleZH),
		)
	}

	return true, nil
}

type localizedMetadata struct {
	TitleEN    string
	TitleZH    string
	OverviewEN string
	OverviewZH string
}

func (p *Plugin) fetchLocalizedText(ctx context.Context, contentType model.ContentType, contentID string) (localizedMetadata, error) {
	if p == nil || p.tmdbClient == nil {
		return localizedMetadata{}, nil
	}

	client, err := p.tmdbClient.Get()
	if err != nil {
		return localizedMetadata{}, err
	}

	id, err := strconv.ParseInt(strings.TrimSpace(contentID), 10, 64)
	if err != nil {
		return localizedMetadata{}, fmt.Errorf("invalid tmdb content id: %w", err)
	}

	var result localizedMetadata

	switch contentType {
	case model.ContentTypeTvShow:
		zhDetails, zhErr := client.TvDetails(ctx, tmdbapi.TvDetailsRequest{
			SeriesID: id,
			Language: model.NewNullString("zh-CN"),
		})
		if zhErr == nil {
			result.TitleZH = strings.TrimSpace(zhDetails.Name)
			result.OverviewZH = strings.TrimSpace(zhDetails.Overview)
		}

		enDetails, enErr := client.TvDetails(ctx, tmdbapi.TvDetailsRequest{
			SeriesID: id,
			Language: model.NewNullString("en-US"),
		})
		if enErr == nil {
			result.TitleEN = strings.TrimSpace(enDetails.Name)
			result.OverviewEN = strings.TrimSpace(enDetails.Overview)
		}

		if zhErr != nil && enErr != nil {
			return localizedMetadata{}, fmt.Errorf("fetch tv details failed: zh=%v, en=%v", zhErr, enErr)
		}
		return result, nil

	default:
		zhDetails, zhErr := client.MovieDetails(ctx, tmdbapi.MovieDetailsRequest{
			ID:       id,
			Language: model.NewNullString("zh-CN"),
		})
		if zhErr == nil {
			result.TitleZH = strings.TrimSpace(zhDetails.Title)
			result.OverviewZH = strings.TrimSpace(zhDetails.Overview)
		}

		enDetails, enErr := client.MovieDetails(ctx, tmdbapi.MovieDetailsRequest{
			ID:       id,
			Language: model.NewNullString("en-US"),
		})
		if enErr == nil {
			result.TitleEN = strings.TrimSpace(enDetails.Title)
			result.OverviewEN = strings.TrimSpace(enDetails.Overview)
		}

		if zhErr != nil && enErr != nil {
			return localizedMetadata{}, fmt.Errorf("fetch movie details failed: zh=%v, en=%v", zhErr, enErr)
		}
		return result, nil
	}
}

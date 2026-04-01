package media

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/subtitles"
	"gorm.io/gorm"
)

func loadDetailSubtitleTemplates(ctx context.Context, db *gorm.DB) ([]DetailSubtitleTemplate, error) {
	templates, err := subtitles.Load(ctx, db)
	if err != nil {
		return nil, err
	}

	result := make([]DetailSubtitleTemplate, 0, len(templates))
	for _, template := range templates {
		if !template.Enabled {
			continue
		}
		result = append(result, DetailSubtitleTemplate{
			ID:          template.ID,
			Name:        template.Name,
			URLTemplate: template.URLTemplate,
		})
	}
	return result, nil
}

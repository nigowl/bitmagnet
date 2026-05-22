package adminsettings

import (
	"context"
	"errors"

	"github.com/nigowl/bitmagnet/internal/media"
)

func (s *service) BackfillLocalizedMetadata(ctx context.Context, limit int) (media.BackfillLocalizedResult, error) {
	if s.mediaService == nil {
		return media.BackfillLocalizedResult{}, errors.New("media service not available")
	}

	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	return s.mediaService.BackfillLocalizedMetadata(ctx, media.BackfillLocalizedInput{Limit: limit})
}

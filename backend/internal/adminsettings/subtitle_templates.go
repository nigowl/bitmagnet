package adminsettings

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/subtitles"
)

func (s *service) ListSubtitleTemplates(ctx context.Context) ([]subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}
	return subtitles.Load(ctx, db)
}

func (s *service) CreateSubtitleTemplate(ctx context.Context, input subtitles.Input) (subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return subtitles.Template{}, err
	}
	return subtitles.Create(ctx, db, input)
}

func (s *service) UpdateSubtitleTemplate(ctx context.Context, id string, input subtitles.Input) (subtitles.Template, error) {
	db, err := s.db.Get()
	if err != nil {
		return subtitles.Template{}, err
	}
	return subtitles.Update(ctx, db, id, input)
}

func (s *service) DeleteSubtitleTemplate(ctx context.Context, id string) error {
	db, err := s.db.Get()
	if err != nil {
		return err
	}
	return subtitles.Delete(ctx, db, id)
}

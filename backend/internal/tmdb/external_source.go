package tmdb

import (
	"github.com/nigowl/bitmagnet/internal/classifier/classification"
	"github.com/nigowl/bitmagnet/internal/model"
)

func ExternalSource(ref model.ContentRef) (externalSource string, externalID string, err error) {
	switch {
	case (ref.Type == model.ContentTypeMovie ||
		ref.Type == model.ContentTypeTvShow ||
		ref.Type == model.ContentTypeXxx) &&
		ref.Source == model.SourceImdb:
		externalSource = "imdb_id"
		externalID = ref.ID
	case (ref.Type == model.ContentTypeMovie ||
		ref.Type == model.ContentTypeTvShow) &&
		ref.Source == model.SourceDouban:
		externalSource = "douban_id"
		externalID = ref.ID
	case ref.Type == model.ContentTypeTvShow && ref.Source == model.SourceTvdb:
		externalSource = "tvdb_id"
		externalID = ref.ID
	default:
		err = classification.ErrUnmatched
	}

	return
}

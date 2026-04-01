package tmdb

import (
	"strconv"
	"strings"

	"github.com/bitmagnet-io/bitmagnet/internal/classifier/classification"
	"github.com/bitmagnet-io/bitmagnet/internal/model"
	"github.com/bitmagnet-io/bitmagnet/internal/slice"
)

func MovieDetailsToMovieModel(details MovieDetailsResponse) (movie model.Content, err error) {
	releaseDate := model.Date{}

	if details.ReleaseDate != "" {
		parsedDate, parseDateErr := model.NewDateFromIsoString(details.ReleaseDate)
		if parseDateErr != nil {
			err = parseDateErr
			return
		}

		releaseDate = parsedDate
	}

	//nolint:prealloc
	var collections []model.ContentCollection

	if details.BelongsToCollection.ID != 0 {
		collections = append(collections, model.ContentCollection{
			Type:   "franchise",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(details.BelongsToCollection.ID)),
			Name:   details.BelongsToCollection.Name,
		})
	}

	for _, genre := range details.Genres {
		collections = append(collections, model.ContentCollection{
			Type:   "genre",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(genre.ID)),
			Name:   genre.Name,
		})
	}

	for _, country := range details.ProductionCountries {
		if country.Name == "" {
			continue
		}
		collections = append(collections, model.ContentCollection{
			Type:   "country",
			Source: model.SourceTmdb,
			ID:     country.Iso3166_1,
			Name:   country.Name,
		})
	}

	for _, studio := range details.ProductionCompanies {
		if studio.Name == "" {
			continue
		}
		collections = append(collections, model.ContentCollection{
			Type:   "studio",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(studio.ID)),
			Name:   studio.Name,
		})
	}

	var attributes []model.ContentAttribute
	if details.IMDbID != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceImdb,
			Key:    "id",
			Value:  details.IMDbID,
		})
	}

	if details.PosterPath != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTmdb,
			Key:    "poster_path",
			Value:  details.PosterPath,
		})
	}

	if details.BackdropPath != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTmdb,
			Key:    "backdrop_path",
			Value:  details.BackdropPath,
		})
	}

	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "homepage", details.Homepage)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "status", details.Status)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "tagline", details.Tagline)

	if len(details.SpokenLanguages) > 0 {
		attributes = appendAttributeIfNotEmpty(
			attributes,
			model.SourceTmdb,
			"spoken_languages",
			strings.Join(slice.Map(details.SpokenLanguages, func(language struct {
				Iso639_1 string `json:"iso_639_1"`
				Name     string `json:"name"`
			}) string {
				if language.Name != "" {
					return language.Name
				}
				return language.Iso639_1
			}), " / "),
		)
	}
	attributes = appendAttributeIfNotEmpty(
		attributes,
		model.SourceTmdb,
		"production_countries",
		strings.Join(slice.Map(details.ProductionCountries, func(country struct {
			Iso3166_1 string `json:"iso_3166_1"`
			Name      string `json:"name"`
		}) string {
			if country.Name != "" {
				return country.Name
			}
			return country.Iso3166_1
		}), " / "),
	)
	castNames := joinMovieCastNames(details.Credits.Cast, 12)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "cast", castNames)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "director", joinMovieCrewNames(details.Credits.Crew, "Director"))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "writer", joinMovieWriters(details.Credits.Crew))

	releaseYear := releaseDate.Year

	contentType := model.ContentTypeMovie

	if details.Adult {
		contentType = model.ContentTypeXxx
	}

	return model.Content{
		Type:             contentType,
		Source:           model.SourceTmdb,
		ID:               strconv.Itoa(int(details.ID)),
		Title:            details.Title,
		ReleaseDate:      releaseDate,
		ReleaseYear:      releaseYear,
		Adult:            model.NewNullBool(details.Adult),
		OriginalLanguage: model.ParseLanguage(details.OriginalLanguage),
		OriginalTitle:    model.NewNullString(details.OriginalTitle),
		Overview: model.NullString{
			String: details.Overview,
			Valid:  details.Overview != "",
		},
		Runtime: model.NullUint16{
			Uint16: uint16(details.Runtime),
			Valid:  details.Runtime > 0,
		},
		Popularity:  model.NewNullFloat32(details.Popularity),
		VoteAverage: model.NewNullFloat32(details.VoteAverage),
		VoteCount:   model.NewNullUint(uint(details.VoteCount)),
		Collections: collections,
		Attributes:  attributes,
	}, nil
}

func TvShowDetailsToTvShowModel(details TvDetailsResponse) (movie model.Content, err error) {
	firstAirDate := model.Date{}

	if details.FirstAirDate != "" {
		parsedDate, parseDateErr := model.NewDateFromIsoString(details.FirstAirDate)
		if parseDateErr != nil {
			err = parseDateErr
			return
		}

		firstAirDate = parsedDate
	}

	collections := slice.Map(details.Genres, func(genre Genre) model.ContentCollection {
		return model.ContentCollection{
			Type:   "genre",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(genre.ID)),
			Name:   genre.Name,
		}
	})

	for _, country := range details.ProductionCountries {
		if country.Name == "" {
			continue
		}
		collections = append(collections, model.ContentCollection{
			Type:   "country",
			Source: model.SourceTmdb,
			ID:     country.Iso3166_1,
			Name:   country.Name,
		})
	}

	for _, network := range details.Networks {
		if network.Name == "" {
			continue
		}
		collections = append(collections, model.ContentCollection{
			Type:   "network",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(network.ID)),
			Name:   network.Name,
		})
	}

	for _, studio := range details.ProductionCompanies {
		if studio.Name == "" {
			continue
		}
		collections = append(collections, model.ContentCollection{
			Type:   "studio",
			Source: model.SourceTmdb,
			ID:     strconv.Itoa(int(studio.ID)),
			Name:   studio.Name,
		})
	}

	var attributes []model.ContentAttribute

	if details.ExternalIDs.IMDbID != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceImdb,
			Key:    "id",
			Value:  details.ExternalIDs.IMDbID,
		})
	}

	if details.ExternalIDs.TVDBID != 0 {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTvdb,
			Key:    "id",
			Value:  strconv.Itoa(int(details.ExternalIDs.TVDBID)),
		})
	}

	releaseYear := firstAirDate.Year

	if details.PosterPath != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTmdb,
			Key:    "poster_path",
			Value:  details.PosterPath,
		})
	}

	if details.BackdropPath != "" {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTmdb,
			Key:    "backdrop_path",
			Value:  details.BackdropPath,
		})
	}

	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "homepage", details.Homepage)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "status", details.Status)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "type", details.Type)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "tagline", details.Tagline)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "first_air_date", details.FirstAirDate)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "last_air_date", details.LastAirDate)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "origin_country", strings.Join(details.OriginCountry, " / "))
	attributes = appendAttributeIfNotEmpty(
		attributes,
		model.SourceTmdb,
		"production_countries",
		strings.Join(slice.Map(details.ProductionCountries, func(country struct {
			Iso3166_1 string `json:"iso_3166_1"`
			Name      string `json:"name"`
		}) string {
			if country.Name != "" {
				return country.Name
			}
			return country.Iso3166_1
		}), " / "),
	)
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "release_date", details.FirstAirDate)

	if len(details.CreatedBy) > 0 {
		attributes = appendAttributeIfNotEmpty(
			attributes,
			model.SourceTmdb,
			"creators",
			strings.Join(slice.Map(details.CreatedBy, func(creator struct {
				ID          int64  `json:"id"`
				CreditID    string `json:"credit_id"`
				Name        string `json:"name"`
				Gender      int    `json:"gender"`
				ProfilePath string `json:"profile_path"`
			}) string {
				return creator.Name
			}), " / "),
		)
	}

	episodeRuntime := 0
	for _, runtime := range details.EpisodeRunTime {
		if runtime > 0 {
			episodeRuntime = runtime
			break
		}
	}
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "runtime", strconv.Itoa(episodeRuntime))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "spoken_languages", strings.Join(details.Languages, " / "))

	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "cast", joinTvCastNames(details.AggregateCredits.Cast, 16))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "director", joinTvCrewNames(details.AggregateCredits.Crew, "Director"))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "writer", joinTvWriters(details.AggregateCredits.Crew))

	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "number_of_seasons", strconv.Itoa(details.NumberOfSeasons))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "number_of_episodes", strconv.Itoa(details.NumberOfEpisodes))
	attributes = appendAttributeIfNotEmpty(attributes, model.SourceTmdb, "episode_count", strconv.Itoa(details.NumberOfEpisodes))

	if details.InProduction {
		attributes = append(attributes, model.ContentAttribute{
			Source: model.SourceTmdb,
			Key:    "in_production",
			Value:  "true",
		})
	}

	return model.Content{
		Type:             model.ContentTypeTvShow,
		Source:           model.SourceTmdb,
		ID:               strconv.Itoa(int(details.ID)),
		Title:            details.Name,
		ReleaseDate:      firstAirDate,
		ReleaseYear:      releaseYear,
		OriginalLanguage: model.ParseLanguage(details.OriginalLanguage),
		OriginalTitle:    model.NewNullString(details.OriginalName),
		Overview: model.NullString{
			String: details.Overview,
			Valid:  details.Overview != "",
		},
		Popularity:  model.NewNullFloat32(details.Popularity),
		VoteAverage: model.NewNullFloat32(details.VoteAverage),
		VoteCount:   model.NewNullUint(uint(details.VoteCount)),
		Collections: collections,
		Attributes:  attributes,
	}, nil
}

func appendAttributeIfNotEmpty(attributes []model.ContentAttribute, source, key, value string) []model.ContentAttribute {
	if strings.TrimSpace(value) == "" {
		return attributes
	}

	return append(attributes, model.ContentAttribute{
		Source: source,
		Key:    key,
		Value:  value,
	})
}

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

func joinMovieCastNames(cast []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Order        int    `json:"order"`
}, limit int) string {
	names := make([]string, 0, len(cast))
	for i, item := range cast {
		if limit > 0 && i >= limit {
			break
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return strings.Join(names, " / ")
}

func joinMovieCrewNames(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobs ...string) string {
	jobSet := make(map[string]struct{}, len(jobs))
	for _, job := range jobs {
		jobSet[strings.ToLower(job)] = struct{}{}
	}

	names := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range crew {
		job := strings.ToLower(strings.TrimSpace(item.Job))
		if len(jobSet) > 0 {
			if _, ok := jobSet[job]; !ok {
				continue
			}
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, name)
	}

	return strings.Join(names, " / ")
}

func joinMovieWriters(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}) string {
	jobWhitelist := map[string]struct{}{
		"writer":     {},
		"screenplay": {},
		"story":      {},
		"teleplay":   {},
	}

	names := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range crew {
		job := strings.ToLower(strings.TrimSpace(item.Job))
		if _, ok := jobWhitelist[job]; !ok {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, name)
	}

	return strings.Join(names, " / ")
}

func joinTvCastNames(cast []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Order        int    `json:"order"`
}, limit int) string {
	names := make([]string, 0, len(cast))
	for i, item := range cast {
		if limit > 0 && i >= limit {
			break
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return strings.Join(names, " / ")
}

func joinTvCrewNames(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobs ...string) string {
	jobSet := make(map[string]struct{}, len(jobs))
	for _, job := range jobs {
		jobSet[strings.ToLower(job)] = struct{}{}
	}

	names := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range crew {
		job := strings.ToLower(strings.TrimSpace(item.Job))
		if len(jobSet) > 0 {
			if _, ok := jobSet[job]; !ok {
				continue
			}
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, name)
	}

	return strings.Join(names, " / ")
}

func joinTvWriters(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}) string {
	jobWhitelist := map[string]struct{}{
		"writer":             {},
		"screenplay":         {},
		"story":              {},
		"teleplay":           {},
		"series composition": {},
		"creator":            {},
	}

	names := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range crew {
		job := strings.ToLower(strings.TrimSpace(item.Job))
		if _, ok := jobWhitelist[job]; !ok {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.OriginalName)
		}
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, name)
	}

	return strings.Join(names, " / ")
}

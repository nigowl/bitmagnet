package media

import "github.com/bitmagnet-io/bitmagnet/internal/model"

func listItemFromModel(row model.MediaEntry) ListItem {
	item := ListItem{
		ID:                  row.ID,
		ContentType:         row.ContentType.String(),
		Title:               row.Title,
		NameOriginal:        nullStringPtr(row.NameOriginal),
		NameEn:              nullStringPtr(row.NameEn),
		NameZh:              nullStringPtr(row.NameZh),
		OverviewOriginal:    nullStringPtr(row.OverviewOriginal),
		OverviewEn:          nullStringPtr(row.OverviewEn),
		OverviewZh:          nullStringPtr(row.OverviewZh),
		Tagline:             nullStringPtr(row.Tagline),
		StatusText:          nullStringPtr(row.StatusText),
		HomepageURL:         nullStringPtr(row.HomepageURL),
		IMDbID:              nullStringPtr(row.IMDbID),
		DoubanID:            nullStringPtr(row.DoubanID),
		PosterPath:          nullStringPtr(row.PosterPath),
		BackdropPath:        nullStringPtr(row.BackdropPath),
		VoteAverage:         nullFloat32Ptr(row.VoteAverage),
		VoteCount:           nullUintPtr(row.VoteCount),
		Genres:              append([]string(nil), row.Genres...),
		Languages:           append([]string(nil), row.Languages...),
		ProductionCountries: append([]string(nil), row.ProductionCountries...),
		SpokenLanguages:     append([]string(nil), row.SpokenLanguages...),
		PremiereDates:       append([]string(nil), row.PremiereDates...),
		SeasonCount:         nullUintPtr(row.SeasonCount),
		EpisodeCount:        nullUintPtr(row.EpisodeCount),
		NetworkNames:        append([]string(nil), row.NetworkNames...),
		StudioNames:         append([]string(nil), row.StudioNames...),
		AwardNames:          append([]string(nil), row.AwardNames...),
		CreatorNames:        append([]string(nil), row.CreatorNames...),
		TitleAliases:        append([]string(nil), row.TitleAliases...),
		Certification:       nullStringPtr(row.Certification),
		CastMembers:         append([]string(nil), row.CastMembers...),
		DirectorNames:       append([]string(nil), row.DirectorNames...),
		WriterNames:         append([]string(nil), row.WriterNames...),
		QualityTags:         append([]string(nil), row.QualityTags...),
		Collections:         make([]ListCollection, 0, len(row.Collections)),
		Attributes:          make([]ListAttribute, 0, len(row.Attributes)),
		IsAnime:             row.IsAnime,
		TorrentCount:        row.TorrentCount,
		MaxSeeders:          nullUintPtr(row.MaxSeeders),
		LatestPublishedAt:   row.LatestPublishedAt,
		UpdatedAt:           row.UpdatedAt,
	}

	if !row.ReleaseYear.IsNil() {
		year := int(row.ReleaseYear)
		item.ReleaseYear = &year
	}

	for _, collection := range row.Collections {
		item.Collections = append(item.Collections, ListCollection{
			Type: collection.Type,
			Name: collection.Name,
		})
	}

	for _, attribute := range row.Attributes {
		item.Attributes = append(item.Attributes, ListAttribute{
			Source: attribute.Source,
			Key:    attribute.Key,
			Value:  attribute.Value,
		})
	}

	return item
}

func detailItemFromModel(entry model.MediaEntry) DetailItem {
	item := DetailItem{
		ID:                  entry.ID,
		ContentType:         entry.ContentType.String(),
		ContentSource:       entry.ContentSource,
		ContentID:           entry.ContentID,
		Title:               entry.Title,
		NameOriginal:        nullStringPtr(entry.NameOriginal),
		NameEn:              nullStringPtr(entry.NameEn),
		NameZh:              nullStringPtr(entry.NameZh),
		OverviewOriginal:    nullStringPtr(entry.OverviewOriginal),
		OverviewEn:          nullStringPtr(entry.OverviewEn),
		OverviewZh:          nullStringPtr(entry.OverviewZh),
		Tagline:             nullStringPtr(entry.Tagline),
		StatusText:          nullStringPtr(entry.StatusText),
		HomepageURL:         nullStringPtr(entry.HomepageURL),
		OriginalLanguage:    nullLanguageNamePtr(entry.OriginalLanguage),
		Runtime:             nullUint16Ptr(entry.Runtime),
		Popularity:          nullFloat32Ptr(entry.Popularity),
		VoteAverage:         nullFloat32Ptr(entry.VoteAverage),
		VoteCount:           nullUintPtr(entry.VoteCount),
		IMDbID:              nullStringPtr(entry.IMDbID),
		DoubanID:            nullStringPtr(entry.DoubanID),
		PosterPath:          nullStringPtr(entry.PosterPath),
		BackdropPath:        nullStringPtr(entry.BackdropPath),
		Genres:              append([]string(nil), entry.Genres...),
		ProductionCountries: append([]string(nil), entry.ProductionCountries...),
		SpokenLanguages:     append([]string(nil), entry.SpokenLanguages...),
		PremiereDates:       append([]string(nil), entry.PremiereDates...),
		SeasonCount:         nullUintPtr(entry.SeasonCount),
		EpisodeCount:        nullUintPtr(entry.EpisodeCount),
		NetworkNames:        append([]string(nil), entry.NetworkNames...),
		StudioNames:         append([]string(nil), entry.StudioNames...),
		AwardNames:          append([]string(nil), entry.AwardNames...),
		CreatorNames:        append([]string(nil), entry.CreatorNames...),
		TitleAliases:        append([]string(nil), entry.TitleAliases...),
		Certification:       nullStringPtr(entry.Certification),
		CastMembers:         append([]string(nil), entry.CastMembers...),
		DirectorNames:       append([]string(nil), entry.DirectorNames...),
		WriterNames:         append([]string(nil), entry.WriterNames...),
		QualityTags:         append([]string(nil), entry.QualityTags...),
		IsAnime:             entry.IsAnime,
		TorrentCount:        entry.TorrentCount,
		MaxSeeders:          nullUintPtr(entry.MaxSeeders),
		LatestPublishedAt:   entry.LatestPublishedAt,
		Collections:         make([]DetailCollection, 0, len(entry.Collections)),
		Attributes:          make([]DetailAttribute, 0, len(entry.Attributes)),
		Languages:           make([]DetailLanguage, 0, len(entry.Languages)),
	}

	if !entry.ReleaseDate.IsNil() {
		releaseDate := entry.ReleaseDate.IsoDateString()
		item.ReleaseDate = &releaseDate
	}

	if !entry.ReleaseYear.IsNil() {
		releaseYear := int(entry.ReleaseYear)
		item.ReleaseYear = &releaseYear
	}

	for _, collection := range entry.Collections {
		item.Collections = append(item.Collections, DetailCollection{
			Type: collection.Type,
			Name: collection.Name,
		})
	}

	for _, attribute := range entry.Attributes {
		item.Attributes = append(item.Attributes, DetailAttribute{
			Source: attribute.Source,
			Key:    attribute.Key,
			Value:  attribute.Value,
		})
	}

	for _, language := range entry.Languages {
		item.Languages = append(item.Languages, detailLanguageFromCode(language))
	}

	return item
}

func detailTorrentFromModel(tc model.TorrentContent) DetailTorrent {
	item := DetailTorrent{
		InfoHash:    tc.InfoHash.String(),
		Title:       tc.Title(),
		Seeders:     nullUintPtr(tc.Seeders),
		Leechers:    nullUintPtr(tc.Leechers),
		Size:        tc.Size,
		FilesCount:  nullUintPtr(tc.FilesCount),
		PublishedAt: tc.PublishedAt,
		UpdatedAt:   tc.UpdatedAt,
		Languages:   make([]DetailLanguage, 0, len(tc.Languages)),
	}

	if tc.VideoResolution.Valid {
		videoResolution := tc.VideoResolution.VideoResolution.String()
		item.VideoResolution = &videoResolution
	}

	if tc.VideoSource.Valid {
		videoSource := tc.VideoSource.VideoSource.String()
		item.VideoSource = &videoSource
	}

	for language := range tc.Languages {
		langID := language.ID()
		item.Languages = append(item.Languages, DetailLanguage{ID: &langID, Name: language.Name()})
	}

	item.Torrent.Name = tc.Torrent.Name
	item.Torrent.Size = tc.Torrent.Size
	item.Torrent.FilesCount = nullUintPtr(tc.Torrent.FilesCount)
	item.Torrent.SingleFile = tc.Torrent.SingleFile()
	if ft := tc.Torrent.FileType(); ft.Valid {
		ftValue := ft.FileType.String()
		item.Torrent.FileType = &ftValue
	}
	item.Torrent.MagnetURI = tc.Torrent.MagnetURI()
	item.Torrent.TagNames = tc.Torrent.TagNames()
	item.Torrent.Sources = make([]DetailSource, 0, len(tc.Torrent.Sources))
	for _, source := range tc.Torrent.Sources {
		name := source.Source
		if source.TorrentSource.Key != "" {
			name = source.TorrentSource.Name
		}
		item.Torrent.Sources = append(item.Torrent.Sources, DetailSource{Key: source.Source, Name: name})
	}

	return item
}

func nullStringPtr(value model.NullString) *string {
	if !value.Valid {
		return nil
	}
	v := value.String
	return &v
}

func nullFloat32Ptr(value model.NullFloat32) *float32 {
	if !value.Valid {
		return nil
	}
	v := value.Float32
	return &v
}

func nullUintPtr(value model.NullUint) *uint {
	if !value.Valid {
		return nil
	}
	v := value.Uint
	return &v
}

func nullUint16Ptr(value model.NullUint16) *uint16 {
	if !value.Valid {
		return nil
	}
	v := value.Uint16
	return &v
}

func nullLanguageNamePtr(value model.NullLanguage) *string {
	if !value.Valid {
		return nil
	}
	v := value.Language.Name()
	return &v
}

func detailLanguageFromCode(code string) DetailLanguage {
	lang := model.ParseLanguage(code)
	if lang.Valid {
		langID := lang.Language.ID()
		return DetailLanguage{ID: &langID, Name: lang.Language.Name()}
	}
	return DetailLanguage{Name: code}
}

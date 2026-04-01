package media

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/bitmagnet-io/bitmagnet/internal/database/dao"
	"github.com/bitmagnet-io/bitmagnet/internal/lazy"
	"github.com/bitmagnet-io/bitmagnet/internal/model"
	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	categoryAll    = "all"
	categoryMovie  = "movie"
	categorySeries = "series"
	categoryAnime  = "anime"

	sortLatest   = "latest"
	sortPopular  = "popular"
	sortDownload = "download"
	sortRating   = "rating"
	sortUpdated  = "updated"
)

var ErrNotFound = errors.New("media not found")

type Service interface {
	List(ctx context.Context, input ListInput) (ListResult, error)
	Detail(ctx context.Context, id string) (DetailResult, error)
	Cover(ctx context.Context, id string, kind string, size string) (CoverResult, error)
}

type Params struct {
	fx.In
	Dao    lazy.Lazy[*dao.Query]
	Config Config
}

func NewService(p Params) Service {
	cache, err := newCoverCache(p.Config)
	if err != nil {
		panic(err)
	}

	return &service{
		dao:           p.Dao,
		coverCache:    cache,
		doubanMatcher: newDoubanMatcher(p.Config),
	}
}

type service struct {
	dao           lazy.Lazy[*dao.Query]
	coverCache    *coverCache
	doubanMatcher *doubanMatcher
}

func (s *service) List(ctx context.Context, input ListInput) (ListResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return ListResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 24
	}
	if limit > 120 {
		limit = 120
	}

	page := input.Page
	if page <= 0 {
		page = 1
	}

	category := strings.TrimSpace(strings.ToLower(input.Category))
	if category == "" {
		category = categoryAll
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB().
		Table(model.TableNameMediaEntry + " me").
		Where("me.torrent_count > 0")

	switch category {
	case categoryMovie:
		db = db.Where("me.content_type = ?", model.ContentTypeMovie)
	case categorySeries:
		db = db.Where("me.content_type = ?", model.ContentTypeTvShow)
	case categoryAnime:
		db = db.Where("me.is_anime = ?", true).Where("me.content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow})
	default:
		db = db.Where("me.content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow})
	}

	search := strings.TrimSpace(input.Search)
	if search != "" {
		like := "%" + search + "%"
		db = db.Where(
			`me.title ILIKE ?
			OR me.name_original ILIKE ?
			OR me.name_en ILIKE ?
			OR me.name_zh ILIKE ?
			OR me.original_title ILIKE ?
			OR me.overview ILIKE ?
			OR me.overview_original ILIKE ?
			OR me.overview_en ILIKE ?
			OR me.overview_zh ILIKE ?
			OR me.tagline ILIKE ?
			OR CAST(me.title_aliases AS text) ILIKE ?
			OR CAST(me.cast_members AS text) ILIKE ?
			OR CAST(me.director_names AS text) ILIKE ?
			OR CAST(me.writer_names AS text) ILIKE ?
			OR CAST(me.creator_names AS text) ILIKE ?
			OR CAST(me.release_year AS text) ILIKE ?
			OR CAST(me.attributes AS text) ILIKE ?`,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
			like,
		)
	}

	if quality := normalizeListFilter(input.Quality); quality != "" {
		db = applyQualityFilter(db, quality)
	}

	if year := normalizeListFilter(input.Year); year != "" {
		db = applyYearFilter(db, year)
	}

	if genre := normalizeListFilter(input.Genre); genre != "" {
		db = applyGenreFilter(db, genre)
	}

	if language := normalizeListFilter(input.Language); language != "" {
		db = applyLanguageFilter(db, language)
	}

	if country := normalizeListFilter(input.Country); country != "" {
		db = applyMetadataFilter(db, countryFilterPatterns(country))
	}

	if network := normalizeListFilter(input.Network); network != "" {
		db = applyMetadataFilter(db, networkFilterPatterns(network))
	}

	if studio := normalizeListFilter(input.Studio); studio != "" {
		db = applyMetadataFilter(db, studioFilterPatterns(studio))
	}

	if awards := normalizeListFilter(input.Awards); awards != "" {
		db = applyMetadataFilter(db, awardsFilterPatterns(awards))
	}

	baseQuery := db.Session(&gorm.Session{})

	var totalCount int64
	if err := baseQuery.Count(&totalCount).Error; err != nil {
		return ListResult{}, err
	}

	var totalTorrentCount int64
	if err := baseQuery.
		Select("COALESCE(SUM(me.torrent_count), 0)").
		Scan(&totalTorrentCount).Error; err != nil {
		return ListResult{}, err
	}

	db = applySort(baseQuery.Session(&gorm.Session{}), normalizeSort(input.Sort))

	var rows []model.MediaEntry
	if err := db.Select("me.*").
		Offset((page - 1) * limit).
		Limit(limit).
		Find(&rows).Error; err != nil {
		return ListResult{}, err
	}

	items := make([]ListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, listItemFromModel(row))
	}

	return ListResult{
		TotalCount:        totalCount,
		TotalTorrentCount: totalTorrentCount,
		Items:             items,
	}, nil
}

func (s *service) Detail(ctx context.Context, id string) (DetailResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return DetailResult{}, err
	}

	mediaID := strings.TrimSpace(id)
	if mediaID == "" {
		return DetailResult{}, ErrNotFound
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()

	entry, err := s.loadOrCreateMediaEntry(ctx, db, mediaID)
	if err != nil {
		return DetailResult{}, err
	}

	entry, err = s.enrichDoubanIfNeeded(ctx, db, entry)
	if err != nil {
		return DetailResult{}, err
	}
	if err := enrichStructuredMetadata(ctx, db, []string{entry.ID}); err == nil {
		var refreshed model.MediaEntry
		if reloadErr := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", entry.ID).
			Take(&refreshed).Error; reloadErr == nil {
			entry = refreshed
		}
	}

	torrentContents, err := q.TorrentContent.WithContext(ctx).
		Where(
			q.TorrentContent.ContentType.Eq(string(entry.ContentType)),
			q.TorrentContent.ContentSource.Eq(entry.ContentSource),
			q.TorrentContent.ContentID.Eq(entry.ContentID),
		).
		Order(q.TorrentContent.Seeders.Desc(), q.TorrentContent.UpdatedAt.Desc()).
		Preload(
			q.TorrentContent.Torrent.RelationField,
			q.TorrentContent.Torrent.Sources.RelationField,
			q.TorrentContent.Torrent.Sources.TorrentSource.RelationField,
			q.TorrentContent.Torrent.Tags.RelationField,
		).
		Find()
	if err != nil {
		return DetailResult{}, err
	}

	result := DetailResult{
		Item: detailItemFromModel(entry),
	}
	for _, tc := range torrentContents {
		result.Torrents = append(result.Torrents, detailTorrentFromModel(*tc))
	}

	return result, nil
}

func (s *service) Cover(ctx context.Context, id string, kind string, size string) (CoverResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return CoverResult{}, err
	}

	mediaID := strings.TrimSpace(id)
	if mediaID == "" {
		return CoverResult{}, ErrNotFound
	}

	coverKindValue, err := parseCoverKind(kind)
	if err != nil {
		return CoverResult{}, ErrCoverNotFound
	}

	coverSizeValue, err := parseCoverSize(size)
	if err != nil {
		return CoverResult{}, ErrCoverNotFound
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	entry, err := s.loadOrCreateMediaEntry(ctx, db, mediaID)
	if err != nil {
		return CoverResult{}, err
	}

	var sourcePath string
	switch coverKindValue {
	case coverKindPoster:
		sourcePath = strings.TrimSpace(entry.PosterPath.String)
	case coverKindBackdrop:
		sourcePath = strings.TrimSpace(entry.BackdropPath.String)
	default:
		return CoverResult{}, ErrCoverNotFound
	}

	if sourcePath == "" {
		return CoverResult{}, ErrCoverNotFound
	}

	filePath, err := s.coverCache.resolvePath(ctx, mediaID, coverKindValue, coverSizeValue, sourcePath)
	if err != nil {
		return CoverResult{}, err
	}

	return CoverResult{FilePath: filePath}, nil
}

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

func (s *service) enrichDoubanIfNeeded(ctx context.Context, db *gorm.DB, entry model.MediaEntry) (model.MediaEntry, error) {
	if s.doubanMatcher == nil || entry.DoubanID.Valid {
		return entry, nil
	}

	match, ok, err := s.doubanMatcher.match(ctx, entry)
	if err != nil || !ok {
		return entry, nil
	}

	now := time.Now()
	if err := db.WithContext(ctx).
		Table(model.TableNameMetadataSource).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "updated_at"}),
		}).
		Create(&model.MetadataSource{
			Key:       model.SourceDouban,
			Name:      "Douban",
			CreatedAt: now,
			UpdatedAt: now,
		}).Error; err != nil {
		return entry, nil
	}

	attrs := []model.ContentAttribute{
		{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "id",
			Value:         match.ID,
			CreatedAt:     now,
			UpdatedAt:     now,
		},
	}
	if match.Title != "" {
		attrs = append(attrs, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "title",
			Value:         match.Title,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	if match.SubTitle != "" {
		attrs = append(attrs, model.ContentAttribute{
			ContentType:   entry.ContentType,
			ContentSource: entry.ContentSource,
			ContentID:     entry.ContentID,
			Source:        model.SourceDouban,
			Key:           "sub_title",
			Value:         match.SubTitle,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}

	for _, attr := range attrs {
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
			return entry, nil
		}
	}

	ref := model.ContentRef{
		Type:   entry.ContentType,
		Source: entry.ContentSource,
		ID:     entry.ContentID,
	}
	if err := SyncEntries(ctx, db, []model.ContentRef{ref}); err != nil {
		return entry, nil
	}

	var refreshed model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id = ?", entry.ID).
		Take(&refreshed).Error; err != nil {
		return entry, nil
	}

	return refreshed, nil
}

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
		OriginalTitle:       nullStringPtr(row.OriginalTitle),
		Overview:            nullStringPtr(row.Overview),
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
		OriginalTitle:       nullStringPtr(entry.OriginalTitle),
		OriginalLanguage:    nullLanguageNamePtr(entry.OriginalLanguage),
		Overview:            nullStringPtr(entry.Overview),
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

func normalizeListFilter(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || value == categoryAll {
		return ""
	}
	return value
}

func normalizeSort(value string) string {
	normalized := normalizeListFilter(value)
	switch normalized {
	case sortLatest, sortPopular, sortDownload, sortRating, sortUpdated:
		return normalized
	default:
		return sortLatest
	}
}

func applyQualityFilter(db *gorm.DB, quality string) *gorm.DB {
	switch quality {
	case "3d":
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) IN ('V3D', 'V3DSBS', 'V3DOU')
			)`,
		)
	case "dolby_vision":
		return db.Where(
			"me.attributes::text ILIKE ? OR me.title ILIKE ? OR me.original_title ILIKE ?",
			"%dolby vision%",
			"%dolby vision%",
			"%dolby vision%",
		)
	case "4k":
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) IN ('V2160P', 'V4320P')
			)`,
		)
	case "1080p", "720p", "480p", "360p":
		target := "V" + strings.ToUpper(quality)
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) = ?
			)`,
			target,
		)
	default:
		return db
	}
}

func applyYearFilter(db *gorm.DB, year string) *gorm.DB {
	currentYear := time.Now().UTC().Year()

	switch year {
	case "upcoming":
		return db.Where("(me.release_date > CURRENT_DATE OR me.release_year > ?)", currentYear)
	case "older":
		return db.Where("me.release_year < ?", 1950)
	}

	if strings.HasSuffix(year, "s") && len(year) == 5 {
		if start, err := strconv.Atoi(year[:4]); err == nil {
			return db.Where("me.release_year BETWEEN ? AND ?", start, start+9)
		}
	}

	if value, err := strconv.Atoi(year); err == nil {
		return db.Where("me.release_year = ?", value)
	}

	return db
}

func applyGenreFilter(db *gorm.DB, genre string) *gorm.DB {
	patterns := genreFilterPatterns(genre)
	if len(patterns) == 0 {
		return db
	}

	return db.Where(
		`EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(coalesce(me.genres, '[]'::jsonb)) AS genre_item(value)
			WHERE lower(genre_item.value) IN ?
		)`,
		patterns,
	)
}

func applyLanguageFilter(db *gorm.DB, language string) *gorm.DB {
	patterns := languageFilterPatterns(language)
	if len(patterns) == 0 {
		return db
	}

	return db.Where(
		`EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(coalesce(me.languages, '[]'::jsonb)) AS language_item(value)
			WHERE lower(language_item.value) IN ?
		) OR lower(CAST(me.original_language AS text)) IN ?`,
		patterns,
		patterns,
	)
}

func applyMetadataFilter(db *gorm.DB, patterns []string) *gorm.DB {
	clauses := make([]string, 0, len(patterns)*2)
	args := make([]any, 0, len(patterns)*2)

	for _, pattern := range patterns {
		normalized := strings.TrimSpace(strings.ToLower(pattern))
		if normalized == "" {
			continue
		}
		like := "%" + normalized + "%"
		clauses = append(clauses, "lower(CAST(me.collections AS text)) LIKE ?")
		args = append(args, like)
		clauses = append(clauses, "lower(CAST(me.attributes AS text)) LIKE ?")
		args = append(args, like)
	}

	if len(clauses) == 0 {
		return db
	}

	return db.Where("("+strings.Join(clauses, " OR ")+")", args...)
}

func genreFilterPatterns(genre string) []string {
	switch genre {
	case "comedy":
		return []string{"comedy"}
	case "animation":
		return []string{"animation", "anime", "动画", "动漫"}
	case "action":
		return []string{"action", "action & adventure"}
	case "romance":
		return []string{"romance"}
	case "horror":
		return []string{"horror"}
	case "war":
		return []string{"war", "war & politics"}
	case "thriller":
		return []string{"thriller"}
	case "crime":
		return []string{"crime"}
	case "science_fiction":
		return []string{"science fiction", "sci-fi", "sci fi"}
	case "mystery":
		return []string{"mystery"}
	case "fantasy":
		return []string{"fantasy"}
	case "drama":
		return []string{"drama"}
	case "adventure":
		return []string{"adventure", "action & adventure"}
	case "family":
		return []string{"family"}
	case "kids":
		return []string{"kids", "family"}
	case "history":
		return []string{"history"}
	case "biography":
		return []string{"biography", "documentary"}
	case "sport":
		return []string{"sport"}
	case "music":
		return []string{"music", "musical"}
	case "western":
		return []string{"western"}
	case "documentary":
		return []string{"documentary"}
	default:
		return []string{strings.ReplaceAll(genre, "_", " ")}
	}
}

func languageFilterPatterns(language string) []string {
	switch language {
	case "english":
		return []string{"english", "en"}
	case "chinese":
		return []string{"chinese", "zh", "cmn"}
	case "japanese":
		return []string{"japanese", "ja"}
	case "korean":
		return []string{"korean", "ko"}
	case "french":
		return []string{"french", "fr"}
	case "german":
		return []string{"german", "de"}
	case "spanish":
		return []string{"spanish", "es"}
	case "italian":
		return []string{"italian", "it"}
	case "russian":
		return []string{"russian", "ru"}
	case "portuguese":
		return []string{"portuguese", "pt"}
	case "hindi":
		return []string{"hindi", "hi"}
	default:
		return []string{strings.ReplaceAll(language, "_", " ")}
	}
}

func countryFilterPatterns(country string) []string {
	switch country {
	case "united_states":
		return []string{"united states", "usa", "u.s."}
	case "china":
		return []string{"china", "mainland china", "people's republic of china"}
	case "japan":
		return []string{"japan"}
	case "south_korea":
		return []string{"south korea", "korea"}
	case "united_kingdom":
		return []string{"united kingdom", "uk", "great britain", "britain"}
	case "france":
		return []string{"france"}
	case "germany":
		return []string{"germany"}
	case "india":
		return []string{"india"}
	case "thailand":
		return []string{"thailand"}
	case "hong_kong":
		return []string{"hong kong", "hong kong sar china"}
	case "taiwan":
		return []string{"taiwan"}
	case "spain":
		return []string{"spain"}
	default:
		return []string{strings.ReplaceAll(country, "_", " ")}
	}
}

func networkFilterPatterns(network string) []string {
	switch network {
	case "netflix":
		return []string{"netflix"}
	case "disney_plus":
		return []string{"disney+", "disney plus"}
	case "hbo":
		return []string{"hbo", "max"}
	case "apple_tv_plus":
		return []string{"apple tv+", "apple tv plus"}
	case "prime_video":
		return []string{"prime video", "amazon prime video"}
	case "hulu":
		return []string{"hulu"}
	case "bbc":
		return []string{"bbc"}
	case "nhk":
		return []string{"nhk"}
	case "tencent_video":
		return []string{"tencent video", "wetv"}
	case "iqiyi":
		return []string{"iqiyi", "i qiyi"}
	case "youku":
		return []string{"youku"}
	default:
		return []string{strings.ReplaceAll(network, "_", " ")}
	}
}

func studioFilterPatterns(studio string) []string {
	switch studio {
	case "marvel_studios":
		return []string{"marvel studios", "marvel"}
	case "disney":
		return []string{"disney", "walt disney"}
	case "warner_bros":
		return []string{"warner bros", "warner brothers"}
	case "a24":
		return []string{"a24"}
	case "pixar":
		return []string{"pixar"}
	case "dreamworks":
		return []string{"dreamworks"}
	case "studio_ghibli":
		return []string{"studio ghibli", "ghibli"}
	case "toei_animation":
		return []string{"toei animation", "toei"}
	case "mappa":
		return []string{"mappa"}
	case "netflix":
		return []string{"netflix"}
	case "hbo":
		return []string{"hbo"}
	default:
		return []string{strings.ReplaceAll(studio, "_", " ")}
	}
}

func awardsFilterPatterns(award string) []string {
	switch award {
	case "oscar":
		return []string{"academy award", "oscars", "oscar"}
	case "emmy":
		return []string{"emmy"}
	case "golden_globe":
		return []string{"golden globe"}
	case "cannes":
		return []string{"cannes", "palme d'or"}
	case "berlin":
		return []string{"berlin", "berlinale"}
	case "venice":
		return []string{"venice"}
	case "bafta":
		return []string{"bafta", "british academy"}
	case "sundance":
		return []string{"sundance"}
	default:
		return []string{strings.ReplaceAll(award, "_", " ")}
	}
}

func applySort(db *gorm.DB, sort string) *gorm.DB {
	switch sort {
	case sortPopular:
		return db.Order("COALESCE(me.popularity, 0) DESC").
			Order("COALESCE(me.vote_count, 0) DESC").
			Order("COALESCE(me.max_seeders, 0) DESC")
	case sortDownload:
		return db.Order("COALESCE(me.max_seeders, 0) DESC").
			Order("me.torrent_count DESC").
			Order("COALESCE(me.latest_published_at, me.updated_at) DESC")
	case sortRating:
		return db.Order("COALESCE(me.vote_average, 0) DESC").
			Order("COALESCE(me.vote_count, 0) DESC").
			Order("COALESCE(me.popularity, 0) DESC")
	case sortUpdated:
		return db.Order("me.updated_at DESC").
			Order("COALESCE(me.latest_published_at, me.updated_at) DESC")
	default:
		return db.Order("COALESCE(me.release_date::timestamp, me.latest_published_at, me.updated_at) DESC").
			Order("COALESCE(me.max_seeders, 0) DESC").
			Order("me.updated_at DESC")
	}
}

package media

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/media/siteplugins"
	"github.com/nigowl/bitmagnet/internal/model"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"gorm.io/gorm"
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
	Detail(ctx context.Context, id string, options ...DetailOptions) (DetailResult, error)
	Cover(ctx context.Context, id string, kind string, size string) (CoverResult, error)
	BackfillLocalizedMetadata(ctx context.Context, input BackfillLocalizedInput) (BackfillLocalizedResult, error)
	BackfillCoverCache(ctx context.Context, input BackfillCoverCacheInput) (BackfillCoverCacheResult, error)
}

type Params struct {
	fx.In
	Dao     lazy.Lazy[*dao.Query]
	Config  Config
	Plugins []siteplugins.Plugin `group:"media_site_plugins"`
	Logger  *zap.Logger          `optional:"true"`
}

func NewService(p Params) Service {
	cache, err := newCoverCache(p.Config)
	if err != nil {
		panic(err)
	}

	pluginLogger := zap.NewNop()
	if p.Logger != nil {
		pluginLogger = p.Logger.Named("media_site_plugins")
	}

	return &service{
		dao:        p.Dao,
		coverCache: cache,
		sitePluginManager: siteplugins.NewManager(siteplugins.ManagerOptions{
			Logger: pluginLogger,
			DefaultEnabled: map[string]bool{
				model.SourceTmdb:   p.Config.TMDBEnabled,
				model.SourceImdb:   p.Config.IMDbEnabled,
				model.SourceDouban: p.Config.DoubanEnabled,
			},
		}, p.Plugins...),
	}
}

type service struct {
	dao               lazy.Lazy[*dao.Query]
	coverCache        *coverCache
	sitePluginManager *siteplugins.Manager
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

func (s *service) Detail(ctx context.Context, id string, options ...DetailOptions) (DetailResult, error) {
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

	var detailOptions DetailOptions
	if len(options) > 0 {
		detailOptions = options[0]
	}

	entry = s.sitePluginManager.Enrich(ctx, db, entry, siteplugins.EnrichOptions{
		Force:      detailOptions.ForceRefresh,
		PluginKeys: detailOptions.PluginKeys,
	})
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

func (s *service) BackfillLocalizedMetadata(ctx context.Context, input BackfillLocalizedInput) (BackfillLocalizedResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return BackfillLocalizedResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	startedAt := time.Now()

	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("content_source = ?", model.SourceTmdb).
		Where("content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow}).
		Where(`coalesce(name_zh, '') = ''
			OR coalesce(overview_zh, '') = ''
			OR coalesce(name_en, '') = ''
			OR coalesce(overview_en, '') = ''`).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return BackfillLocalizedResult{}, err
	}

	result := BackfillLocalizedResult{
		Requested: len(rows),
	}
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: 0,
			Updated:   0,
		})
	}

	for _, row := range rows {
		result.Processed++
		beforeReady := hasBilingualOverviewAndTitle(row)

		enriched := s.sitePluginManager.Enrich(ctx, db, row, siteplugins.EnrichOptions{
			Force:      true,
			PluginKeys: []string{model.SourceTmdb},
		})

		if err := enrichStructuredMetadata(ctx, db, []string{enriched.ID}); err != nil {
			continue
		}

		var refreshed model.MediaEntry
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", enriched.ID).
			Take(&refreshed).Error; err != nil {
			continue
		}

		afterReady := hasBilingualOverviewAndTitle(refreshed)
		if afterReady && !beforeReady {
			result.Updated++
		}
		if input.Progress != nil {
			input.Progress(BackfillProgressInfo{
				Requested: result.Requested,
				Processed: result.Processed,
				Updated:   result.Updated,
				CurrentID: row.ID,
			})
		}
	}

	var remaining int64
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("content_source = ?", model.SourceTmdb).
		Where("content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow}).
		Where(`coalesce(name_zh, '') = ''
			OR coalesce(overview_zh, '') = ''
			OR coalesce(name_en, '') = ''
			OR coalesce(overview_en, '') = ''`).
		Count(&remaining).Error; err == nil {
		result.Remaining = int(remaining)
	}
	result.DurationMs = time.Since(startedAt).Milliseconds()
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: result.Processed,
			Updated:   result.Updated,
			Remaining: result.Remaining,
		})
	}

	return result, nil
}

func (s *service) BackfillCoverCache(ctx context.Context, input BackfillCoverCacheInput) (BackfillCoverCacheResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return BackfillCoverCacheResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	startedAt := time.Now()

	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("torrent_count > 0").
		Where(`coalesce(poster_path, '') <> '' OR coalesce(backdrop_path, '') <> ''`).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return BackfillCoverCacheResult{}, err
	}

	result := BackfillCoverCacheResult{
		Requested: len(rows),
	}
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: 0,
			Updated:   0,
			Message:   "cover cache backfill started",
		})
	}

	for _, row := range rows {
		entryUpdated := false
		result.Processed++

		if strings.TrimSpace(row.PosterPath.String) != "" {
			cachePath := s.coverCache.variantPath(row.ID, coverKindPoster, coverSizeMD)
			if !fileExists(cachePath) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, row.ID, coverKindPoster, coverSizeMD, row.PosterPath.String); resolveErr != nil {
					result.Failed++
				} else {
					entryUpdated = true
				}
			}
		}

		if strings.TrimSpace(row.BackdropPath.String) != "" {
			cachePath := s.coverCache.variantPath(row.ID, coverKindBackdrop, coverSizeMD)
			if !fileExists(cachePath) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, row.ID, coverKindBackdrop, coverSizeMD, row.BackdropPath.String); resolveErr != nil {
					result.Failed++
				} else {
					entryUpdated = true
				}
			}
		}

		if entryUpdated {
			result.Updated++
		}

		if input.Progress != nil {
			input.Progress(BackfillProgressInfo{
				Requested: result.Requested,
				Processed: result.Processed,
				Updated:   result.Updated,
				CurrentID: row.ID,
			})
		}
	}

	result.DurationMs = time.Since(startedAt).Milliseconds()
	if input.Progress != nil {
		input.Progress(BackfillProgressInfo{
			Requested: result.Requested,
			Processed: result.Processed,
			Updated:   result.Updated,
			Remaining: result.Remaining,
			Message:   "cover cache backfill completed",
		})
	}

	return result, nil
}

func hasBilingualOverviewAndTitle(entry model.MediaEntry) bool {
	return strings.TrimSpace(entry.NameZh.String) != "" &&
		strings.TrimSpace(entry.OverviewZh.String) != "" &&
		strings.TrimSpace(entry.NameEn.String) != "" &&
		strings.TrimSpace(entry.OverviewEn.String) != ""
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

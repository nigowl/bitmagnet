package media

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/media/siteplugins"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/fx"
	"go.uber.org/zap"
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

	coverFailureRetryTTL    = 2 * time.Minute
	coverFailureNotFoundTTL = 6 * time.Hour
)

var ErrNotFound = errors.New("media not found")
var ErrInvalidInfoHash = errors.New("invalid info hash")
var ErrPlayerDisabled = errors.New("player is disabled")
var ErrPlayerTransmissionDisabled = errors.New("player transmission is disabled")
var ErrPlayerTranscodeDisabled = errors.New("player transcode is disabled")
var ErrPlayerFileNotFound = errors.New("player file not found")
var ErrPlayerStreamUnavailable = errors.New("player stream range unavailable")
var ErrPlayerStorageUnavailable = errors.New("player storage unavailable")
var ErrPlayerInvalidRange = errors.New("player invalid range")
var ErrPlayerSubtitleInvalid = errors.New("player subtitle invalid")
var ErrPlayerSubtitleNotFound = errors.New("player subtitle not found")

type Service interface {
	List(ctx context.Context, input ListInput) (ListResult, error)
	Detail(ctx context.Context, id string, options ...DetailOptions) (DetailResult, error)
	PlayerTransmissionBootstrap(ctx context.Context, input PlayerTransmissionBootstrapInput) (PlayerTransmissionBootstrapResult, error)
	PlayerTransmissionSelectFile(ctx context.Context, input PlayerTransmissionSelectFileInput) (PlayerTransmissionSelectFileResult, error)
	PlayerTransmissionAudioTracks(ctx context.Context, input PlayerTransmissionAudioTracksInput) (PlayerTransmissionAudioTracksResult, error)
	PlayerTransmissionStatus(ctx context.Context, input PlayerTransmissionStatusInput) (PlayerTransmissionStatusResult, error)
	PlayerTransmissionBatchStatus(ctx context.Context, input PlayerTransmissionBatchStatusInput) (PlayerTransmissionBatchStatusResult, error)
	PlayerTransmissionResolveStream(ctx context.Context, input PlayerTransmissionResolveStreamInput) (PlayerTransmissionResolveStreamResult, error)
	PlayerSubtitleList(ctx context.Context, input PlayerSubtitleListInput) ([]PlayerSubtitle, error)
	PlayerSubtitleCreate(ctx context.Context, input PlayerSubtitleCreateInput) (PlayerSubtitle, error)
	PlayerSubtitleUpdate(ctx context.Context, input PlayerSubtitleUpdateInput) (PlayerSubtitle, error)
	PlayerSubtitleDelete(ctx context.Context, input PlayerSubtitleDeleteInput) error
	PlayerSubtitleContent(ctx context.Context, input PlayerSubtitleContentInput) (PlayerSubtitleContentResult, error)
	Cover(ctx context.Context, id string, kind string, size string) (CoverResult, error)
	GenerateCover(ctx context.Context, input GenerateCoverInput) error
	BackfillLocalizedMetadata(ctx context.Context, input BackfillLocalizedInput) (BackfillLocalizedResult, error)
	BackfillCoverCache(ctx context.Context, input BackfillCoverCacheInput) (BackfillCoverCacheResult, error)
	CountPendingLocalizedMetadata(ctx context.Context) (int, error)
	CountPendingCoverCache(ctx context.Context) (int, error)
	EnsureContentRefsReady(ctx context.Context, refs []model.ContentRef) error
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
	serviceLogger := zap.NewNop()
	if p.Logger != nil {
		pluginLogger = p.Logger.Named("media_site_plugins")
		serviceLogger = p.Logger.Named("media_service")
	}

	return &service{
		dao:        p.Dao,
		coverCache: cache,
		logger:     serviceLogger,
		sitePluginManager: siteplugins.NewManager(siteplugins.ManagerOptions{
			Logger: pluginLogger,
			DefaultEnabled: map[string]bool{
				model.SourceTmdb:   p.Config.TMDBEnabled,
				model.SourceImdb:   p.Config.IMDbEnabled,
				model.SourceDouban: p.Config.DoubanEnabled,
			},
		}, p.Plugins...),
		runtime: mediaRuntimeSettings{
			configCacheTTL: 15 * time.Second,
			defaults: mediaRuntimeOptions{
				autoCacheCover:     true,
				autoFetchBilingual: true,
			},
			cached: mediaRuntimeOptions{
				autoCacheCover:     true,
				autoFetchBilingual: true,
			},
		},
	}
}

type service struct {
	dao               lazy.Lazy[*dao.Query]
	coverCache        *coverCache
	coverFailures     sync.Map
	logger            *zap.Logger
	sitePluginManager *siteplugins.Manager
	runtime           mediaRuntimeSettings
}

func (s *service) InvalidateRuntimeSettingsCache() {
	if s == nil {
		return
	}

	s.runtime.mutex.Lock()
	s.runtime.cacheLoaded = false
	s.runtime.cachedAt = time.Time{}
	s.runtime.cached = s.runtime.defaults
	s.runtime.mutex.Unlock()

	if s.sitePluginManager != nil {
		s.sitePluginManager.InvalidateRuntimeSettingsCache()
	}
}

type mediaRuntimeSettings struct {
	configCacheTTL time.Duration
	defaults       mediaRuntimeOptions

	mutex       sync.RWMutex
	cacheLoaded bool
	cachedAt    time.Time
	cached      mediaRuntimeOptions
}

type mediaRuntimeOptions struct {
	autoCacheCover     bool
	autoFetchBilingual bool
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
		Item:          detailItemFromModel(entry),
		PlayerEnabled: true,
	}
	if playerSettings, settingsErr := s.loadPlayerBootstrapSettings(ctx, db); settingsErr == nil {
		result.PlayerEnabled = playerSettings.PlayerEnabled
	}
	for _, tc := range torrentContents {
		result.Torrents = append(result.Torrents, detailTorrentFromModel(*tc))
	}
	if templates, templateErr := loadDetailSubtitleTemplates(ctx, db); templateErr == nil {
		result.SubtitleTemplates = templates
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
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
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
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
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

	rows, err := s.loadPendingCoverEntries(ctx, db, limit)
	if err != nil {
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
			if s.entryNeedsCoverCacheKind(row.ID, coverKindPoster, row.PosterPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, row.ID, coverKindPoster, coverSizeMD, row.PosterPath.String); resolveErr != nil {
					result.Failed++
				} else {
					entryUpdated = true
				}
			}
		}

		if strings.TrimSpace(row.BackdropPath.String) != "" {
			if s.entryNeedsCoverCacheKind(row.ID, coverKindBackdrop, row.BackdropPath.String) {
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

	if remaining, countErr := s.countPendingCoverCacheWithDB(ctx, db); countErr == nil {
		result.Remaining = remaining
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

func (s *service) CountPendingLocalizedMetadata(ctx context.Context) (int, error) {
	q, err := s.dao.Get()
	if err != nil {
		return 0, err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	var count int64
	if err := localizedPendingScope(db.WithContext(ctx).
		Table(model.TableNameMediaEntry)).
		Count(&count).Error; err != nil {
		return 0, err
	}

	return int(count), nil
}

func (s *service) CountPendingCoverCache(ctx context.Context) (int, error) {
	q, err := s.dao.Get()
	if err != nil {
		return 0, err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	return s.countPendingCoverCacheWithDB(ctx, db)
}

func (s *service) EnsureContentRefsReady(ctx context.Context, refs []model.ContentRef) error {
	filteredRefs := filterSupportedRefs(refs)
	if len(filteredRefs) == 0 {
		return nil
	}

	q, err := s.dao.Get()
	if err != nil {
		return err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	runtimeOptions := s.loadRuntimeOptions(ctx, db)
	if !runtimeOptions.autoFetchBilingual && !runtimeOptions.autoCacheCover {
		return nil
	}

	mediaIDs := make([]string, 0, len(filteredRefs))
	for _, ref := range filteredRefs {
		mediaIDs = append(mediaIDs, model.MediaEntryID(ref.Type, ref.Source, ref.ID))
	}

	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", mediaIDs).
		Where("torrent_count > 0").
		Find(&rows).Error; err != nil {
		return err
	}

	var runErr error
outer:
	for _, row := range rows {
		if ctxErr := ctx.Err(); ctxErr != nil {
			if runErr == nil {
				runErr = ctxErr
			}
			break
		}

		current := row

		if runtimeOptions.autoFetchBilingual {
			enriched := s.sitePluginManager.Enrich(ctx, db, row)
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			if enrichErr := enrichStructuredMetadata(ctx, db, []string{enriched.ID}); enrichErr != nil && runErr == nil {
				runErr = enrichErr
				if errors.Is(enrichErr, context.Canceled) || errors.Is(enrichErr, context.DeadlineExceeded) {
					break
				}
			}
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			var refreshed model.MediaEntry
			if reloadErr := db.WithContext(ctx).
				Table(model.TableNameMediaEntry).
				Where("id = ?", enriched.ID).
				Take(&refreshed).Error; reloadErr == nil {
				current = refreshed
			} else if (errors.Is(reloadErr, context.Canceled) || errors.Is(reloadErr, context.DeadlineExceeded)) && runErr == nil {
				runErr = reloadErr
				break
			}
		}

		if runtimeOptions.autoCacheCover {
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			if strings.TrimSpace(current.PosterPath.String) != "" &&
				s.entryNeedsCoverCacheKind(current.ID, coverKindPoster, current.PosterPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, current.ID, coverKindPoster, coverSizeMD, current.PosterPath.String); resolveErr != nil && runErr == nil {
					runErr = resolveErr
					if errors.Is(resolveErr, context.Canceled) || errors.Is(resolveErr, context.DeadlineExceeded) {
						break outer
					}
				}
			}
			if strings.TrimSpace(current.BackdropPath.String) != "" &&
				s.entryNeedsCoverCacheKind(current.ID, coverKindBackdrop, current.BackdropPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, current.ID, coverKindBackdrop, coverSizeMD, current.BackdropPath.String); resolveErr != nil && runErr == nil {
					runErr = resolveErr
					if errors.Is(resolveErr, context.Canceled) || errors.Is(resolveErr, context.DeadlineExceeded) {
						break outer
					}
				}
			}
		}
	}

	return runErr
}

func (s *service) loadRuntimeOptions(ctx context.Context, db *gorm.DB) mediaRuntimeOptions {
	if db == nil {
		return s.runtime.defaults
	}

	now := time.Now()
	s.runtime.mutex.RLock()
	useCache := s.runtime.cacheLoaded && now.Sub(s.runtime.cachedAt) < s.runtime.configCacheTTL
	cached := s.runtime.cached
	defaults := s.runtime.defaults
	s.runtime.mutex.RUnlock()
	if useCache {
		return cached
	}

	values, err := runtimeconfig.ReadValues(ctx, db, []string{
		runtimeconfig.KeyMediaAutoCacheCover,
		runtimeconfig.KeyMediaAutoFetchBilingual,
	})
	if err != nil {
		return cached
	}

	parsed := defaults
	for rawKey, value := range values {
		rawValue := strings.TrimSpace(value)
		value, err := strconv.ParseBool(rawValue)
		if err != nil {
			continue
		}

		switch rawKey {
		case runtimeconfig.KeyMediaAutoCacheCover:
			parsed.autoCacheCover = value
		case runtimeconfig.KeyMediaAutoFetchBilingual:
			parsed.autoFetchBilingual = value
		}
	}

	s.runtime.mutex.Lock()
	s.runtime.cacheLoaded = true
	s.runtime.cachedAt = now
	s.runtime.cached = parsed
	s.runtime.mutex.Unlock()

	return parsed
}

func hasBilingualOverviewAndTitle(entry model.MediaEntry) bool {
	return strings.TrimSpace(entry.NameZh.String) != "" &&
		strings.TrimSpace(entry.OverviewZh.String) != "" &&
		strings.TrimSpace(entry.NameEn.String) != "" &&
		strings.TrimSpace(entry.OverviewEn.String) != ""
}

func localizedPendingScope(db *gorm.DB) *gorm.DB {
	return db.Where("torrent_count > 0").
		Where("content_source = ?", model.SourceTmdb).
		Where("content_type IN ?", []model.ContentType{model.ContentTypeMovie, model.ContentTypeTvShow}).
		Where(`coalesce(name_zh, '') = ''
			OR coalesce(overview_zh, '') = ''
			OR coalesce(name_en, '') = ''
			OR coalesce(overview_en, '') = ''`)
}

func (s *service) loadPendingCoverEntries(ctx context.Context, db *gorm.DB, limit int) ([]model.MediaEntry, error) {
	candidates, err := s.loadCoverCacheCandidates(ctx, db)
	if err != nil {
		return nil, err
	}

	capacity := len(candidates)
	if limit < capacity {
		capacity = limit
	}
	entries := make([]model.MediaEntry, 0, capacity)
	for _, row := range candidates {
		if !s.entryNeedsCoverCache(row) {
			continue
		}
		entries = append(entries, row)
		if len(entries) >= limit {
			break
		}
	}

	return entries, nil
}

func (s *service) loadCoverCacheCandidates(ctx context.Context, db *gorm.DB) ([]model.MediaEntry, error) {
	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("torrent_count > 0").
		Where(`coalesce(poster_path, '') <> '' OR coalesce(backdrop_path, '') <> ''`).
		Order("updated_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *service) countPendingCoverCacheWithDB(ctx context.Context, db *gorm.DB) (int, error) {
	candidates, err := s.loadCoverCacheCandidates(ctx, db)
	if err != nil {
		return 0, err
	}

	pending := 0
	for _, row := range candidates {
		if s.entryNeedsCoverCache(row) {
			pending++
		}
	}
	return pending, nil
}

func (s *service) entryNeedsCoverCache(entry model.MediaEntry) bool {
	return s.entryNeedsCoverCacheKind(entry.ID, coverKindPoster, entry.PosterPath.String) ||
		s.entryNeedsCoverCacheKind(entry.ID, coverKindBackdrop, entry.BackdropPath.String)
}

func (s *service) entryNeedsCoverCacheKind(mediaID string, kind coverKind, sourcePath string) bool {
	if strings.TrimSpace(sourcePath) == "" {
		return false
	}
	cachePath := s.coverCache.variantPath(mediaID, kind, coverSizeMD)
	return !fileExists(cachePath)
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

	filePath := s.coverCache.variantPath(mediaID, coverKindValue, coverSizeValue)
	if fileExists(filePath) {
		return CoverResult{FilePath: filePath}, nil
	}

	failureKey := coverFailureKey(mediaID, coverKindValue, sourcePath)
	if status, blocked := s.coverFailureStatus(failureKey); blocked {
		if status.notFound {
			return CoverResult{}, ErrCoverNotFound
		}
		return CoverResult{Pending: true}, nil
	}

	if err := s.enqueueCoverGeneration(ctx, mediaID, coverKindValue, coverSizeValue, sourcePath); err != nil {
		return CoverResult{}, err
	}

	return CoverResult{Pending: true}, nil
}

func (s *service) GenerateCover(ctx context.Context, input GenerateCoverInput) error {
	mediaID := strings.TrimSpace(input.MediaID)
	if mediaID == "" {
		return nil
	}

	coverKindValue, err := parseCoverKind(strings.TrimSpace(input.Kind))
	if err != nil {
		return nil
	}

	coverSizeValue, err := parseCoverSize(strings.TrimSpace(input.Size))
	if err != nil {
		return nil
	}

	sourcePath := strings.TrimSpace(input.SourcePath)
	if sourcePath == "" {
		q, daoErr := s.dao.Get()
		if daoErr != nil {
			return daoErr
		}

		db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
		entry, entryErr := s.loadOrCreateMediaEntry(ctx, db, mediaID)
		if entryErr != nil {
			return entryErr
		}

		switch coverKindValue {
		case coverKindPoster:
			sourcePath = strings.TrimSpace(entry.PosterPath.String)
		case coverKindBackdrop:
			sourcePath = strings.TrimSpace(entry.BackdropPath.String)
		}
	}

	if sourcePath == "" {
		return ErrCoverNotFound
	}

	remoteURL := s.coverCache.sourceURL(sourcePath)
	if s.logger != nil {
		s.logger.Info("cover queue job started",
			zap.String("media_id", mediaID),
			zap.String("kind", string(coverKindValue)),
			zap.String("size", string(coverSizeValue)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", remoteURL),
			zap.Bool("cache_all_variants", true),
		)
	}

	_, err = s.coverCache.resolvePath(ctx, mediaID, coverKindValue, coverSizeValue, sourcePath)
	if err != nil {
		failureKey := coverFailureKey(mediaID, coverKindValue, sourcePath)
		if errors.Is(err, ErrCoverNotFound) {
			s.rememberCoverFailure(failureKey, true)
			if s.logger != nil {
				s.logger.Info("cover queue job finished without source image",
					zap.String("media_id", mediaID),
					zap.String("kind", string(coverKindValue)),
					zap.String("size", string(coverSizeValue)),
					zap.String("source_path", sourcePath),
					zap.String("source_url", remoteURL),
					zap.Bool("cache_all_variants", true),
				)
			}
			return nil
		}
		s.rememberCoverFailure(failureKey, false)
		if s.logger != nil {
			s.logger.Error("cover queue job failed",
				zap.String("media_id", mediaID),
				zap.String("kind", string(coverKindValue)),
				zap.String("size", string(coverSizeValue)),
				zap.String("source_path", sourcePath),
				zap.String("source_url", remoteURL),
				zap.Bool("cache_all_variants", true),
				zap.Error(err),
			)
		}
		return err
	}

	s.clearCoverFailure(coverFailureKey(mediaID, coverKindValue, sourcePath))
	if s.logger != nil {
		s.logger.Info("cover queue job completed",
			zap.String("media_id", mediaID),
			zap.String("kind", string(coverKindValue)),
			zap.String("size", string(coverSizeValue)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", remoteURL),
			zap.Bool("cache_all_variants", true),
		)
	}

	return nil
}

func (s *service) enqueueCoverGeneration(ctx context.Context, mediaID string, kind coverKind, requestedSize coverSize, sourcePath string) error {
	q, err := s.dao.Get()
	if err != nil {
		return err
	}

	// One queue job renders all cover variants, so we normalize to XL to avoid
	// duplicate jobs for the same media/kind requested at different sizes.
	queueSize := coverSizeXL
	job, err := NewGenerateCoverQueueJob(mediaID, kind, queueSize, sourcePath)
	if err != nil {
		return err
	}

	tx := q.QueueJob.WithContext(ctx).Clauses(clause.OnConflict{
		DoNothing: true,
	}).UnderlyingDB().Create(&job)
	if tx.Error != nil {
		return tx.Error
	}

	if s.logger != nil {
		s.logger.Info("cover queue job enqueued",
			zap.String("media_id", mediaID),
			zap.String("kind", string(kind)),
			zap.String("requested_size", string(requestedSize)),
			zap.String("queue_size", string(queueSize)),
			zap.String("source_path", sourcePath),
			zap.String("source_url", s.coverCache.sourceURL(sourcePath)),
			zap.Bool("duplicate", tx.RowsAffected == 0),
		)
	}

	return nil
}

type coverFailureStatusInfo struct {
	retryAfter time.Time
	notFound   bool
}

func coverFailureKey(mediaID string, kind coverKind, sourcePath string) string {
	return strings.Join([]string{
		strings.TrimSpace(mediaID),
		string(kind),
		strings.TrimSpace(sourcePath),
	}, "|")
}

func (s *service) coverFailureStatus(key string) (coverFailureStatusInfo, bool) {
	now := time.Now()
	value, ok := s.coverFailures.Load(key)
	if !ok {
		return coverFailureStatusInfo{}, false
	}

	status, ok := value.(coverFailureStatusInfo)
	if !ok {
		s.coverFailures.Delete(key)
		return coverFailureStatusInfo{}, false
	}

	if now.After(status.retryAfter) {
		s.coverFailures.Delete(key)
		return coverFailureStatusInfo{}, false
	}

	return status, true
}

func (s *service) rememberCoverFailure(key string, notFound bool) {
	ttl := coverFailureRetryTTL
	if notFound {
		ttl = coverFailureNotFoundTTL
	}

	s.coverFailures.Store(key, coverFailureStatusInfo{
		retryAfter: time.Now().Add(ttl),
		notFound:   notFound,
	})
}

func (s *service) clearCoverFailure(key string) {
	s.coverFailures.Delete(key)
}

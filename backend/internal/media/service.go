package media

import (
	"context"
	"errors"
	"strings"
	"sync"

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
	PlayerTransmissionClearCache(ctx context.Context, input PlayerTransmissionClearCacheInput) (PlayerTransmissionClearCacheResult, error)
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
		runtime: newMediaRuntimeSettings(),
	}
}

type service struct {
	dao               lazy.Lazy[*dao.Query]
	coverCache        *coverCache
	coverFailures     sync.Map
	playerDurations   sync.Map
	playerSelections  sync.Map
	logger            *zap.Logger
	sitePluginManager *siteplugins.Manager
	runtime           mediaRuntimeSettings
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
		db = applyMediaSearchFilter(db, search)
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

	if cacheFilter := normalizeListFilter(input.Cache); cacheFilter == "cached" || cacheFilter == "true" || cacheFilter == "1" {
		db = db.Where("me.has_cache = ?", true)
	}

	scoreMin, hasScoreMin := normalizeScoreBound(input.ScoreMin)
	scoreMax, hasScoreMax := normalizeScoreBound(input.ScoreMax)
	if hasScoreMin || hasScoreMax {
		if !hasScoreMin {
			scoreMin = 0
		}
		if !hasScoreMax {
			scoreMax = 10
		}
		if scoreMax < scoreMin {
			scoreMax = scoreMin
		}
		db = db.Where("me.vote_average IS NOT NULL").Where("me.vote_average >= ? AND me.vote_average <= ?", scoreMin, scoreMax)
	}

	baseQuery := db.Session(&gorm.Session{})
	runtimeOptions := s.loadRuntimeOptions(ctx, q.Torrent.WithContext(ctx).UnderlyingDB().Session(&gorm.Session{NewDB: true}))

	var summary struct {
		TotalCount        int64
		TotalTorrentCount int64
	}
	if err := baseQuery.
		Session(&gorm.Session{}).
		Select("COUNT(*) AS total_count, COALESCE(SUM(me.torrent_count), 0) AS total_torrent_count").
		Scan(&summary).Error; err != nil {
		return ListResult{}, err
	}

	sortKey := normalizeSort(input.Sort)
	popularDays := runtimeOptions.homeHotDays
	if input.HeatDays != nil {
		popularDays = clampHomeHotDays(*input.HeatDays)
	}

	sortedQuery := baseQuery.Session(&gorm.Session{})
	popularOrderExpr := "COALESCE(me.heat_score_recent, 0)"
	if sortKey == sortPopular && popularDays != runtimeOptions.homeHotDays {
		sortedQuery = applyPopularHeatDaysScope(sortedQuery, popularDays)
		popularOrderExpr = "COALESCE(popular_heat.popular_heat_score, 0)"
	}

	db = applySort(sortedQuery, sortKey, popularOrderExpr)

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
		TotalCount:        summary.TotalCount,
		TotalTorrentCount: summary.TotalTorrentCount,
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

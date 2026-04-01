package adminsettings

import (
	"context"
	"fmt"
	"strings"

	"github.com/bitmagnet-io/bitmagnet/internal/media/siteplugins/douban"
	"github.com/bitmagnet-io/bitmagnet/internal/model"
	"github.com/bitmagnet-io/bitmagnet/internal/tmdb"
	"go.uber.org/zap"
)

type PluginTestInput struct {
	Query       string `json:"query"`
	Title       string `json:"title"`
	ContentType string `json:"contentType"`
	Year        *int   `json:"year"`
	IMDbID      string `json:"imdbId"`
	ExternalID  string `json:"externalId"`
}

type PluginTestResult struct {
	Plugin  string         `json:"plugin"`
	Success bool           `json:"success"`
	Message string         `json:"message"`
	Input   map[string]any `json:"input,omitempty"`
	Output  map[string]any `json:"output,omitempty"`
	Logs    []string       `json:"logs,omitempty"`
}

func (s *service) TestPlugin(ctx context.Context, pluginKey string, input PluginTestInput) (PluginTestResult, error) {
	normalized := strings.ToLower(strings.TrimSpace(pluginKey))

	switch normalized {
	case model.SourceTmdb:
		return s.testTMDBPlugin(ctx, input)
	case model.SourceImdb:
		return s.testIMDbPlugin(ctx, input)
	case model.SourceDouban:
		return s.testDoubanPlugin(ctx, input)
	default:
		return PluginTestResult{}, fmt.Errorf("%w: %s", ErrUnsupportedPlugin, pluginKey)
	}
}

func (s *service) testTMDBPlugin(ctx context.Context, input PluginTestInput) (PluginTestResult, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return PluginTestResult{}, err
	}
	if !settings.TMDBEnabled {
		return PluginTestResult{
			Plugin:  model.SourceTmdb,
			Success: false,
			Message: "TMDB plugin is disabled",
		}, nil
	}

	query := strings.TrimSpace(input.Query)
	if query == "" {
		query = strings.TrimSpace(input.Title)
	}
	if query == "" {
		return PluginTestResult{}, fmt.Errorf("%w: query", ErrInvalidInput)
	}

	client, err := s.getTMDBClient()
	if err != nil {
		return PluginTestResult{}, err
	}

	contentType := normalizeTestContentType(input.ContentType)
	languages := []string{"zh-CN", "en-US"}
	logs := make([]string, 0, 8)
	langResults := make(map[string]any, len(languages))
	year := toModelYear(input.Year)

	for _, lang := range languages {
		langTag := model.NewNullString(lang)
		if contentType == model.ContentTypeTvShow {
			resp, searchErr := client.SearchTv(ctx, tmdb.SearchTvRequest{
				Query:            query,
				Language:         langTag,
				FirstAirDateYear: year,
			})
			if searchErr != nil {
				logs = append(logs, fmt.Sprintf("TMDB tv search failed (%s): %v", lang, searchErr))
				langResults[lang] = map[string]any{"error": searchErr.Error()}
				continue
			}
			logs = append(logs, fmt.Sprintf("TMDB tv search success (%s): %d results", lang, len(resp.Results)))
			langResults[lang] = map[string]any{
				"totalResults": resp.TotalResults,
				"firstResult":  mapFirstTVResult(resp.Results),
			}
			continue
		}

		resp, searchErr := client.SearchMovie(ctx, tmdb.SearchMovieRequest{
			Query:              query,
			Language:           langTag,
			PrimaryReleaseYear: year,
			Year:               year,
		})
		if searchErr != nil {
			logs = append(logs, fmt.Sprintf("TMDB movie search failed (%s): %v", lang, searchErr))
			langResults[lang] = map[string]any{"error": searchErr.Error()}
			continue
		}
		logs = append(logs, fmt.Sprintf("TMDB movie search success (%s): %d results", lang, len(resp.Results)))
		langResults[lang] = map[string]any{
			"totalResults": resp.TotalResults,
			"firstResult":  mapFirstMovieResult(resp.Results),
		}
	}

	result := PluginTestResult{
		Plugin:  model.SourceTmdb,
		Success: hasAtLeastOneSuccess(langResults),
		Message: "TMDB test completed",
		Input: map[string]any{
			"query":       query,
			"contentType": contentType.String(),
			"year":        input.Year,
		},
		Output: map[string]any{
			"languages": langResults,
		},
		Logs: logs,
	}
	s.logger.Info("plugin test result", zap.String("plugin", result.Plugin), zap.Bool("success", result.Success), zap.Any("input", result.Input), zap.Any("output", result.Output))
	return result, nil
}

func (s *service) testIMDbPlugin(ctx context.Context, input PluginTestInput) (PluginTestResult, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return PluginTestResult{}, err
	}
	if !settings.IMDbEnabled {
		return PluginTestResult{
			Plugin:  model.SourceImdb,
			Success: false,
			Message: "IMDb plugin is disabled",
		}, nil
	}

	rawID := strings.TrimSpace(input.IMDbID)
	if rawID == "" {
		rawID = strings.TrimSpace(input.ExternalID)
	}
	if rawID == "" {
		rawID = strings.TrimSpace(input.Query)
	}
	normalizedID := normalizeIMDbID(rawID)
	if normalizedID == "" {
		return PluginTestResult{}, fmt.Errorf("%w: imdbId", ErrInvalidInput)
	}

	client, err := s.getTMDBClient()
	if err != nil {
		return PluginTestResult{}, err
	}

	languages := []string{"zh-CN", "en-US"}
	logs := make([]string, 0, 8)
	langResults := make(map[string]any, len(languages))
	for _, lang := range languages {
		resp, findErr := client.FindByID(ctx, tmdb.FindByIDRequest{
			ExternalSource: "imdb_id",
			ExternalID:     normalizedID,
			Language:       model.NewNullString(lang),
		})
		if findErr != nil {
			logs = append(logs, fmt.Sprintf("TMDB find_by_id failed (%s): %v", lang, findErr))
			langResults[lang] = map[string]any{"error": findErr.Error()}
			continue
		}

		logs = append(logs, fmt.Sprintf("TMDB find_by_id success (%s): movie=%d tv=%d", lang, len(resp.MovieResults), len(resp.TvResults)))
		langResults[lang] = map[string]any{
			"movieCount": len(resp.MovieResults),
			"tvCount":    len(resp.TvResults),
			"firstMovie": mapFirstFindMovie(resp.MovieResults),
			"firstTV":    mapFirstFindTV(resp.TvResults),
		}
	}

	result := PluginTestResult{
		Plugin:  model.SourceImdb,
		Success: hasAtLeastOneSuccess(langResults),
		Message: "IMDb test completed via TMDB find_by_id",
		Input: map[string]any{
			"imdbId": normalizedID,
		},
		Output: map[string]any{
			"languages": langResults,
		},
		Logs: logs,
	}
	s.logger.Info("plugin test result", zap.String("plugin", result.Plugin), zap.Bool("success", result.Success), zap.Any("input", result.Input), zap.Any("output", result.Output))
	return result, nil
}

func (s *service) testDoubanPlugin(ctx context.Context, input PluginTestInput) (PluginTestResult, error) {
	settings, err := s.Get(ctx)
	if err != nil {
		return PluginTestResult{}, err
	}
	if !settings.DoubanEnabled {
		return PluginTestResult{
			Plugin:  model.SourceDouban,
			Success: false,
			Message: "Douban plugin is disabled",
		}, nil
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = strings.TrimSpace(input.Query)
	}
	if title == "" {
		return PluginTestResult{}, fmt.Errorf("%w: title", ErrInvalidInput)
	}

	testResult, err := douban.TestMatch(ctx, douban.Config{
		Enabled:        settings.DoubanEnabled,
		SuggestURL:     s.mediaConfig.DoubanSuggestURL,
		SearchURL:      s.mediaConfig.DoubanSearchURL,
		MinScore:       settings.DoubanMinScore,
		HTTPTimeout:    s.mediaConfig.HTTPTimeout,
		Cookie:         settings.DoubanCookie,
		UserAgent:      settings.DoubanUserAgent,
		AcceptLanguage: settings.DoubanAcceptLanguage,
		Referer:        settings.DoubanReferer,
		Logger:         s.logger.Named("douban_test"),
	}, douban.TestInput{
		Title:       title,
		Year:        intFromPtr(input.Year),
		ContentType: input.ContentType,
	})
	if err != nil {
		return PluginTestResult{}, err
	}

	output := map[string]any{
		"queries":    testResult.Queries,
		"candidates": testResult.Candidates,
	}
	if testResult.Matched != nil {
		output["matched"] = testResult.Matched
	}

	result := PluginTestResult{
		Plugin:  model.SourceDouban,
		Success: testResult.Matched != nil,
		Message: "Douban test completed",
		Input: map[string]any{
			"title":       title,
			"contentType": normalizeTestContentType(input.ContentType).String(),
			"year":        input.Year,
			"minScore":    settings.DoubanMinScore,
		},
		Output: output,
		Logs:   testResult.Logs,
	}
	s.logger.Info("plugin test result", zap.String("plugin", result.Plugin), zap.Bool("success", result.Success), zap.Any("input", result.Input), zap.Any("output", result.Output))
	return result, nil
}

func (s *service) getTMDBClient() (tmdb.Client, error) {
	if s.tmdbClient == nil {
		return nil, fmt.Errorf("tmdb client not configured")
	}
	client, err := s.tmdbClient.Get()
	if err != nil {
		return nil, err
	}
	return client, nil
}

func hasAtLeastOneSuccess(langResults map[string]any) bool {
	for _, value := range langResults {
		row, ok := value.(map[string]any)
		if !ok {
			continue
		}
		if _, hasError := row["error"]; hasError {
			continue
		}
		return true
	}
	return false
}

func mapFirstMovieResult(results []tmdb.SearchMovieResult) map[string]any {
	if len(results) == 0 {
		return map[string]any{}
	}
	item := results[0]
	return map[string]any{
		"id":            item.ID,
		"title":         item.Title,
		"originalTitle": item.OriginalTitle,
		"overview":      item.Overview,
		"releaseDate":   item.ReleaseDate,
	}
}

func mapFirstTVResult(results []tmdb.SearchTvResult) map[string]any {
	if len(results) == 0 {
		return map[string]any{}
	}
	item := results[0]
	return map[string]any{
		"id":           item.ID,
		"name":         item.Name,
		"originalName": item.OriginalName,
		"overview":     item.Overview,
		"firstAirDate": item.FirstAirDate,
	}
}

func mapFirstFindMovie(results []struct {
	Adult            bool    `json:"adult"`
	BackdropPath     string  `json:"backdrop_path"`
	GenreIDs         []int64 `json:"genre_ids"`
	ID               int64   `json:"id"`
	OriginalLanguage string  `json:"original_language"`
	OriginalTitle    string  `json:"original_title"`
	Overview         string  `json:"overview"`
	PosterPath       string  `json:"poster_path"`
	ReleaseDate      string  `json:"release_date"`
	Title            string  `json:"title"`
	Video            bool    `json:"video"`
	VoteAverage      float32 `json:"vote_average"`
	VoteCount        int64   `json:"vote_count"`
	Popularity       float32 `json:"popularity"`
}) map[string]any {
	if len(results) == 0 {
		return map[string]any{}
	}
	item := results[0]
	return map[string]any{
		"id":            item.ID,
		"title":         item.Title,
		"originalTitle": item.OriginalTitle,
		"overview":      item.Overview,
		"releaseDate":   item.ReleaseDate,
	}
}

func mapFirstFindTV(results []struct {
	OriginalName     string   `json:"original_name"`
	ID               int64    `json:"id"`
	Name             string   `json:"name"`
	VoteCount        int64    `json:"vote_count"`
	VoteAverage      float32  `json:"vote_average"`
	FirstAirDate     string   `json:"first_air_date"`
	PosterPath       string   `json:"poster_path"`
	GenreIDs         []int64  `json:"genre_ids"`
	OriginalLanguage string   `json:"original_language"`
	BackdropPath     string   `json:"backdrop_path"`
	Overview         string   `json:"overview"`
	OriginCountry    []string `json:"origin_country"`
	Popularity       float32  `json:"popularity"`
}) map[string]any {
	if len(results) == 0 {
		return map[string]any{}
	}
	item := results[0]
	return map[string]any{
		"id":           item.ID,
		"name":         item.Name,
		"originalName": item.OriginalName,
		"overview":     item.Overview,
		"firstAirDate": item.FirstAirDate,
	}
}

func normalizeIMDbID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	valueLower := strings.ToLower(value)
	if strings.HasPrefix(valueLower, "tt") {
		return "tt" + digitsOnly(value[2:])
	}
	digits := digitsOnly(value)
	if digits == "" {
		return ""
	}
	return "tt" + digits
}

func digitsOnly(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func toModelYear(year *int) model.Year {
	if year == nil || *year <= 0 {
		return model.Year(0)
	}
	return model.Year(*year)
}

func intFromPtr(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func normalizeTestContentType(value string) model.ContentType {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "tv", "series", "show", "tv_show":
		return model.ContentTypeTvShow
	default:
		return model.ContentTypeMovie
	}
}

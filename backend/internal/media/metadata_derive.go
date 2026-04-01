package media

import (
	"context"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/bitmagnet-io/bitmagnet/internal/model"
	"gorm.io/gorm"
)

var (
	multiSpaceRegex = regexp.MustCompile(`\s+`)
	digitsRegex     = regexp.MustCompile(`\d+`)
)

var structuredMetadataColumns = []string{
	"name_original",
	"name_en",
	"name_zh",
	"overview_original",
	"overview_en",
	"overview_zh",
	"tagline",
	"status_text",
	"homepage_url",
	"imdb_id",
	"douban_id",
	"production_countries",
	"spoken_languages",
	"premiere_dates",
	"season_count",
	"episode_count",
	"network_names",
	"studio_names",
	"award_names",
	"creator_names",
	"title_aliases",
	"certification",
	"cast_members",
	"director_names",
	"writer_names",
	"updated_at",
}

func enrichStructuredMetadata(ctx context.Context, db *gorm.DB, mediaIDs []string) error {
	if len(mediaIDs) == 0 {
		return nil
	}

	var entries []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", mediaIDs).
		Find(&entries).Error; err != nil {
		return err
	}

	now := time.Now()
	for i := range entries {
		enriched := deriveStructuredMetadata(entries[i])
		enriched.UpdatedAt = now
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", enriched.ID).
			Select(structuredMetadataColumns).
			Updates(&enriched).Error; err != nil {
			return err
		}
	}

	return nil
}

func deriveStructuredMetadata(entry model.MediaEntry) model.MediaEntry {
	result := entry

	if entry.OriginalTitle.Valid && strings.TrimSpace(entry.OriginalTitle.String) != "" {
		result.NameOriginal = model.NewNullString(strings.TrimSpace(entry.OriginalTitle.String))
	} else if title := strings.TrimSpace(entry.Title); title != "" {
		result.NameOriginal = model.NewNullString(title)
	} else {
		result.NameOriginal = model.NullString{}
	}

	nameEnCandidates := []string{
		findFirstAttributeValue(entry.Attributes, "", "title_en", "english_title", "en_title"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "sub_title", "english_title"),
	}
	if isLikelyEnglish(entry.Title) {
		nameEnCandidates = append(nameEnCandidates, entry.Title)
	}
	if entry.OriginalTitle.Valid && isLikelyEnglish(entry.OriginalTitle.String) {
		nameEnCandidates = append(nameEnCandidates, entry.OriginalTitle.String)
	}
	result.NameEn = pickFirstNonEmpty(nameEnCandidates...)

	nameZhCandidates := []string{
		findFirstAttributeValue(entry.Attributes, "", "title_zh", "chinese_title", "zh_title"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "title", "name"),
	}
	if containsHan(entry.Title) {
		nameZhCandidates = append(nameZhCandidates, entry.Title)
	}
	if entry.OriginalTitle.Valid && containsHan(entry.OriginalTitle.String) {
		nameZhCandidates = append(nameZhCandidates, entry.OriginalTitle.String)
	}
	result.NameZh = pickFirstNonEmpty(nameZhCandidates...)

	overviewOriginalCandidates := []string{
		entry.Overview.String,
		findFirstAttributeValue(entry.Attributes, "", "overview", "summary", "description", "intro"),
	}
	result.OverviewOriginal = pickFirstNonEmpty(overviewOriginalCandidates...)

	overviewEnCandidates := []string{
		findFirstAttributeValue(entry.Attributes, "", "overview_en", "summary_en", "description_en", "english_overview", "english_summary"),
	}
	if isLikelyEnglish(entry.Overview.String) {
		overviewEnCandidates = append(overviewEnCandidates, entry.Overview.String)
	}
	result.OverviewEn = pickFirstNonEmpty(overviewEnCandidates...)

	overviewZhCandidates := []string{
		findFirstAttributeValue(entry.Attributes, "", "overview_zh", "summary_zh", "description_zh", "chinese_overview", "chinese_summary", "intro"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "summary", "intro", "description"),
	}
	if containsHan(entry.Overview.String) {
		overviewZhCandidates = append(overviewZhCandidates, entry.Overview.String)
	}
	result.OverviewZh = pickFirstNonEmpty(overviewZhCandidates...)

	result.Tagline = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "tagline"),
	)
	result.StatusText = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "status", "release_status"),
	)
	result.HomepageURL = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "homepage", "homepage_url", "official_site"),
	)

	imdbID := findFirstAttributeValue(entry.Attributes, model.SourceImdb, "id")
	if imdbID == "" && entry.ContentSource == model.SourceImdb {
		imdbID = entry.ContentID
	}
	imdbID = normalizeIMDbID(imdbID)
	if imdbID != "" {
		result.IMDbID = model.NewNullString(imdbID)
	} else {
		result.IMDbID = model.NullString{}
	}

	doubanID := findFirstAttributeValue(entry.Attributes, model.SourceDouban, "id", "douban_id", "subject_id", "subjectid")
	if doubanID == "" && entry.ContentSource == model.SourceDouban {
		doubanID = entry.ContentID
	}
	doubanID = extractDigits(doubanID)
	if doubanID != "" {
		result.DoubanID = model.NewNullString(doubanID)
	} else {
		result.DoubanID = model.NullString{}
	}

	result.ProductionCountries = collectProductionCountries(entry)
	result.SpokenLanguages = collectSpokenLanguages(entry)
	result.PremiereDates = collectPremiereDates(entry)
	result.SeasonCount = collectSeasonCount(entry)
	result.EpisodeCount = collectEpisodeCount(entry)
	result.NetworkNames = collectNetworks(entry)
	result.StudioNames = collectStudios(entry)
	result.AwardNames = collectAwards(entry)
	result.CreatorNames = collectCreators(entry)
	result.TitleAliases = collectTitleAliases(result)
	result.Certification = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "certification", "rated", "mpaa", "age_rating"),
	)
	result.CastMembers = collectPeople(entry.Attributes, "cast", "actors", "actor", "starring", "stars")
	result.DirectorNames = collectPeople(entry.Attributes, "director", "directors")
	result.WriterNames = collectPeople(entry.Attributes, "writer", "writers", "screenplay", "story", "teleplay", "series_composition")

	if len(result.WriterNames) == 0 {
		result.WriterNames = collectPeople(entry.Attributes, "creators", "creator")
	}

	return result
}

func findFirstAttributeValue(attrs []model.MediaAttribute, source string, keys ...string) string {
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[strings.ToLower(strings.TrimSpace(key))] = struct{}{}
	}

	source = strings.ToLower(strings.TrimSpace(source))
	for _, attr := range attrs {
		if source != "" && strings.ToLower(strings.TrimSpace(attr.Source)) != source {
			continue
		}
		if _, ok := keySet[strings.ToLower(strings.TrimSpace(attr.Key))]; !ok {
			continue
		}
		value := strings.TrimSpace(attr.Value)
		if value != "" {
			return value
		}
	}

	return ""
}

func pickFirstNonEmpty(values ...string) model.NullString {
	for _, value := range values {
		normalized := cleanText(value)
		if normalized != "" {
			return model.NewNullString(normalized)
		}
	}
	return model.NullString{}
}

func normalizeIMDbID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.HasPrefix(strings.ToLower(value), "tt") {
		digits := extractDigits(value)
		if digits == "" {
			return ""
		}
		return "tt" + digits
	}
	return value
}

func collectProductionCountries(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, collection := range entry.Collections {
		collectionType := strings.ToLower(strings.TrimSpace(collection.Type))
		if collectionType != "country" && collectionType != "region" {
			continue
		}
		pushUniqueFold(&values, collection.Name)
	}

	for _, value := range collectAttributeValues(entry.Attributes, "", "production_countries", "origin_country", "country", "region") {
		pushUniqueFold(&values, value)
	}

	return values
}

func collectSpokenLanguages(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, value := range collectAttributeValues(entry.Attributes, "", "spoken_languages", "language", "languages") {
		pushUniqueFold(&values, value)
	}

	for _, languageCode := range entry.Languages {
		lang := model.ParseLanguage(languageCode)
		if lang.Valid {
			pushUniqueFold(&values, lang.Language.Name())
			continue
		}
		pushUniqueFold(&values, languageCode)
	}

	return values
}

func collectPremiereDates(entry model.MediaEntry) []string {
	values := make([]string, 0)

	if !entry.ReleaseDate.IsNil() {
		pushUniqueFold(&values, entry.ReleaseDate.IsoDateString())
	}

	for _, value := range collectRawAttributeValues(entry.Attributes, "", "premiere_date", "premiere_dates", "release_date", "release_dates", "first_air_date", "last_air_date", "air_date") {
		for _, item := range splitDateValues(value) {
			pushUniqueFold(&values, item)
		}
	}

	return values
}

func collectEpisodeCount(entry model.MediaEntry) model.NullUint {
	rawValues := collectRawAttributeValues(entry.Attributes, "", "number_of_episodes", "episode_count", "episodes")
	for _, raw := range rawValues {
		match := digitsRegex.FindString(raw)
		if match == "" {
			continue
		}
		value, err := strconv.Atoi(match)
		if err != nil || value <= 0 {
			continue
		}
		return model.NewNullUint(uint(value))
	}

	return model.NullUint{}
}

func collectSeasonCount(entry model.MediaEntry) model.NullUint {
	rawValues := collectRawAttributeValues(entry.Attributes, "", "number_of_seasons", "season_count", "seasons")
	for _, raw := range rawValues {
		match := digitsRegex.FindString(raw)
		if match == "" {
			continue
		}
		value, err := strconv.Atoi(match)
		if err != nil || value <= 0 {
			continue
		}
		return model.NewNullUint(uint(value))
	}

	return model.NullUint{}
}

func collectNetworks(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, collection := range entry.Collections {
		if strings.EqualFold(strings.TrimSpace(collection.Type), "network") {
			pushUniqueFold(&values, collection.Name)
		}
	}
	for _, value := range collectAttributeValues(entry.Attributes, "", "network", "networks", "platform", "channel", "stream") {
		pushUniqueFold(&values, value)
	}

	return values
}

func collectStudios(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, collection := range entry.Collections {
		collectionType := strings.ToLower(strings.TrimSpace(collection.Type))
		if collectionType == "studio" || collectionType == "production_company" {
			pushUniqueFold(&values, collection.Name)
		}
	}
	for _, value := range collectAttributeValues(entry.Attributes, "", "studio", "studios", "production_company", "production_companies", "company", "companies") {
		pushUniqueFold(&values, value)
	}

	return values
}

func collectAwards(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, collection := range entry.Collections {
		collectionType := strings.ToLower(strings.TrimSpace(collection.Type))
		if collectionType == "award" || collectionType == "awards" {
			pushUniqueFold(&values, collection.Name)
		}
	}
	for _, value := range collectAttributeValues(entry.Attributes, "", "award", "awards", "accolades", "wins", "nominations") {
		pushUniqueFold(&values, value)
	}

	return values
}

func collectCreators(entry model.MediaEntry) []string {
	values := make([]string, 0)
	for _, value := range collectAttributeValues(entry.Attributes, "", "creator", "creators", "showrunner", "created_by") {
		pushUniqueFold(&values, value)
	}
	return values
}

func collectTitleAliases(entry model.MediaEntry) []string {
	values := make([]string, 0)
	for _, value := range []string{
		entry.Title,
		entry.OriginalTitle.String,
		entry.NameOriginal.String,
		entry.NameEn.String,
		entry.NameZh.String,
	} {
		pushUniqueFold(&values, value)
	}
	for _, value := range collectAttributeValues(
		entry.Attributes,
		"",
		"aka",
		"aliases",
		"alias",
		"other_names",
		"alternative_titles",
		"also_known_as",
		"title_en",
		"title_zh",
		"english_title",
		"chinese_title",
		"sub_title",
		"name",
	) {
		pushUniqueFold(&values, value)
	}
	return values
}

func collectPeople(attrs []model.MediaAttribute, keys ...string) []string {
	return collectAttributeValues(attrs, "", keys...)
}

func collectAttributeValues(attrs []model.MediaAttribute, source string, keys ...string) []string {
	values := make([]string, 0)
	for _, raw := range collectRawAttributeValues(attrs, source, keys...) {
		for _, part := range splitPeopleOrList(raw) {
			pushUniqueFold(&values, part)
		}
	}
	return values
}

func collectRawAttributeValues(attrs []model.MediaAttribute, source string, keys ...string) []string {
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[strings.ToLower(strings.TrimSpace(key))] = struct{}{}
	}
	normalizedSource := strings.ToLower(strings.TrimSpace(source))

	values := make([]string, 0)
	for _, attr := range attrs {
		if normalizedSource != "" && strings.ToLower(strings.TrimSpace(attr.Source)) != normalizedSource {
			continue
		}
		if _, ok := keySet[strings.ToLower(strings.TrimSpace(attr.Key))]; !ok {
			continue
		}
		normalized := cleanText(attr.Value)
		if normalized != "" {
			values = append(values, normalized)
		}
	}

	return values
}

func splitPeopleOrList(value string) []string {
	value = cleanText(value)
	if value == "" {
		return nil
	}

	parts := strings.FieldsFunc(value, func(r rune) bool {
		switch r {
		case '/', '|', ';', '；', ',', '，', '、', '\n':
			return true
		default:
			return false
		}
	})

	if len(parts) == 0 {
		return []string{value}
	}

	values := make([]string, 0, len(parts))
	for _, part := range parts {
		item := cleanText(part)
		if item != "" {
			values = append(values, item)
		}
	}

	if len(values) == 0 {
		return []string{value}
	}

	return values
}

func splitDateValues(value string) []string {
	value = cleanText(value)
	if value == "" {
		return nil
	}

	parts := strings.FieldsFunc(value, func(r rune) bool {
		switch r {
		case '|', ';', '；', '\n':
			return true
		default:
			return false
		}
	})

	if len(parts) == 0 {
		return []string{value}
	}

	values := make([]string, 0, len(parts))
	for _, part := range parts {
		item := cleanText(part)
		if item != "" {
			values = append(values, item)
		}
	}
	return values
}

func extractDigits(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func containsHan(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func isLikelyEnglish(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}

	for _, r := range value {
		if unicode.IsLetter(r) && r > unicode.MaxASCII {
			return false
		}
	}

	return true
}

func cleanText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return multiSpaceRegex.ReplaceAllString(value, " ")
}

func pushUniqueFold(target *[]string, value string) {
	value = cleanText(value)
	if value == "" {
		return
	}

	for _, existing := range *target {
		if strings.EqualFold(existing, value) {
			return
		}
	}

	*target = append(*target, value)
}

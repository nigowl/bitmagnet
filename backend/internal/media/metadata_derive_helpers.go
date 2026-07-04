package media

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/nigowl/bitmagnet/internal/model"
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

func findFirstAttributeValue(attrs []model.MediaAttribute, source string, keys ...string) string {
	keySet := attributeKeySet(keys)

	source = normalizedAttributeToken(source)
	for _, attr := range attrs {
		if source != "" && normalizedAttributeToken(attr.Source) != source {
			continue
		}
		if _, ok := keySet[normalizedAttributeToken(attr.Key)]; !ok {
			continue
		}
		value := strings.TrimSpace(attr.Value)
		if value != "" {
			return value
		}
	}

	return ""
}

func attributeKeySet(keys []string) map[string]struct{} {
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[normalizedAttributeToken(key)] = struct{}{}
	}
	return keySet
}

func normalizedAttributeToken(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
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

func collectProductionCountries(entry model.MediaEntry) []string {
	values := make([]string, 0)

	for _, collection := range entry.Collections {
		collectionType := normalizedAttributeToken(collection.Type)
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
		collectionType := normalizedAttributeToken(collection.Type)
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
		collectionType := normalizedAttributeToken(collection.Type)
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
	keySet := attributeKeySet(keys)
	normalizedSource := normalizedAttributeToken(source)

	values := make([]string, 0)
	for _, attr := range attrs {
		if normalizedSource != "" && normalizedAttributeToken(attr.Source) != normalizedSource {
			continue
		}
		if _, ok := keySet[normalizedAttributeToken(attr.Key)]; !ok {
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

func isLikelyChinese(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if containsKana(value) || containsHangul(value) {
		return false
	}
	return containsHan(value)
}

func containsKana(value string) bool {
	for _, r := range value {
		if unicode.In(r, unicode.Hiragana, unicode.Katakana) {
			return true
		}
	}
	return false
}

func containsHangul(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Hangul, r) {
			return true
		}
	}
	return false
}

func rebalanceLocalizedText(original model.NullString, en model.NullString, zh model.NullString) (model.NullString, model.NullString, model.NullString) {
	originalValue := cleanText(original.String)
	enValue := cleanText(en.String)
	zhValue := cleanText(zh.String)

	if isLikelyChinese(enValue) && isLikelyEnglish(zhValue) {
		enValue, zhValue = zhValue, enValue
	}

	if !isLikelyChinese(zhValue) && isLikelyChinese(enValue) {
		zhValue, enValue = enValue, ""
	}

	if !isLikelyEnglish(enValue) && isLikelyEnglish(zhValue) {
		enValue, zhValue = zhValue, ""
	}

	if !isLikelyChinese(zhValue) && isLikelyChinese(originalValue) {
		zhValue = originalValue
	}
	if !isLikelyEnglish(enValue) && isLikelyEnglish(originalValue) {
		enValue = originalValue
	}

	if !isLikelyEnglish(enValue) && (containsKana(enValue) || containsHangul(enValue)) {
		enValue = ""
	}
	if !isLikelyChinese(zhValue) && isLikelyEnglish(zhValue) {
		zhValue = ""
	}

	return nullStringFrom(originalValue), nullStringFrom(enValue), nullStringFrom(zhValue)
}

func cleanText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return multiSpaceRegex.ReplaceAllString(value, " ")
}

func nullStringFrom(value string) model.NullString {
	value = cleanText(value)
	if value == "" {
		return model.NullString{}
	}
	return model.NewNullString(value)
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

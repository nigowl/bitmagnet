package media

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/agnivade/levenshtein"
	"github.com/bitmagnet-io/bitmagnet/internal/model"
)

var (
	yearRegex            = regexp.MustCompile(`(?:19|20)\d{2}`)
	bracketContentRegex  = regexp.MustCompile(`[（(［\[\{【][^）)］\]\}】]*[）)］\]\}】]`)
	multiDividerSplitReg = regexp.MustCompile(`[|/·•,:：;；]+`)
)

type doubanMatcher struct {
	suggestURL string
	minScore   float64
	client     *http.Client
}

type doubanSuggestItem struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	SubTitle string `json:"sub_title"`
	Year     string `json:"year"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

type doubanMatch struct {
	ID       string
	Title    string
	SubTitle string
	Score    float64
}

func newDoubanMatcher(cfg Config) *doubanMatcher {
	if !cfg.DoubanEnabled {
		return nil
	}

	suggestURL := strings.TrimSpace(cfg.DoubanSuggestURL)
	if suggestURL == "" {
		suggestURL = "https://movie.douban.com/j/subject_suggest"
	}

	minScore := cfg.DoubanMinScore
	if minScore <= 0 {
		minScore = 0.62
	}

	timeout := cfg.HTTPTimeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	return &doubanMatcher{
		suggestURL: suggestURL,
		minScore:   minScore,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (m *doubanMatcher) match(ctx context.Context, entry model.MediaEntry) (doubanMatch, bool, error) {
	if m == nil {
		return doubanMatch{}, false, nil
	}

	queries := m.buildQueries(entry)
	if len(queries) == 0 {
		return doubanMatch{}, false, nil
	}

	candidatesByID := make(map[string]doubanSuggestItem)
	for _, query := range queries {
		items, err := m.suggest(ctx, query)
		if err != nil {
			continue
		}
		for _, item := range items {
			id := extractDigits(item.ID)
			if id == "" {
				continue
			}
			item.ID = id
			candidatesByID[id] = item
		}
	}

	if len(candidatesByID) == 0 {
		return doubanMatch{}, false, nil
	}

	best := doubanMatch{}
	found := false
	for _, candidate := range candidatesByID {
		score := m.score(entry, candidate)
		if !found || score > best.Score {
			best = doubanMatch{
				ID:       candidate.ID,
				Title:    cleanText(candidate.Title),
				SubTitle: cleanText(candidate.SubTitle),
				Score:    score,
			}
			found = true
		}
	}

	if !found || best.Score < m.minScore {
		return doubanMatch{}, false, nil
	}

	return best, true, nil
}

func (m *doubanMatcher) suggest(ctx context.Context, query string) ([]doubanSuggestItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	endpoint, err := url.Parse(m.suggestURL)
	if err != nil {
		return nil, err
	}

	params := endpoint.Query()
	params.Set("q", query)
	endpoint.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "bitmagnet/1.0 (+https://github.com/bitmagnet-io/bitmagnet)")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("douban suggest request failed: %s", resp.Status)
	}

	var items []doubanSuggestItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, err
	}
	return items, nil
}

func (m *doubanMatcher) buildQueries(entry model.MediaEntry) []string {
	seedNames := []string{
		strings.TrimSpace(entry.NameZh.String),
		strings.TrimSpace(entry.Title),
		strings.TrimSpace(entry.OriginalTitle.String),
		strings.TrimSpace(entry.NameEn.String),
	}

	queries := make([]string, 0, 24)
	for _, name := range seedNames {
		queries = append(queries, buildTitleVariants(name)...)
	}

	if year := strings.TrimSpace(entry.ReleaseYear.String()); year != "" {
		baseQueries := append([]string{}, queries...)
		for _, query := range baseQueries {
			normalized := strings.TrimSpace(query)
			if normalized == "" || strings.Contains(normalized, year) {
				continue
			}
			queries = append(queries, normalized+" "+year)
		}
	}

	result := make([]string, 0, len(queries))
	seen := make(map[string]struct{}, len(queries))
	for _, query := range queries {
		if query == "" {
			continue
		}
		key := strings.ToLower(normalizeComparableText(query))
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, query)
		if len(result) >= 14 {
			break
		}
	}
	return result
}

func (m *doubanMatcher) score(entry model.MediaEntry, item doubanSuggestItem) float64 {
	score := 0.0

	itemType := strings.ToLower(strings.TrimSpace(item.Type))
	switch entry.ContentType {
	case model.ContentTypeMovie:
		if itemType == "movie" {
			score += 0.15
		}
	case model.ContentTypeTvShow:
		if itemType == "tv" || itemType == "tv_show" || itemType == "tv series" {
			score += 0.15
		}
	}

	if !entry.ReleaseYear.IsNil() {
		candidateYear, _ := strconv.Atoi(strings.TrimSpace(item.Year))
		if candidateYear == 0 {
			candidateYear = extractYearFromText(item.Title)
		}
		if candidateYear == 0 {
			candidateYear = extractYearFromText(item.SubTitle)
		}
		if candidateYear > 0 {
			diff := candidateYear - int(entry.ReleaseYear)
			if diff < 0 {
				diff = -diff
			}
			switch diff {
			case 0:
				score += 0.22
			case 1:
				score += 0.12
			case 2:
				score += 0.06
			}
		}
	}

	candidateNames := []string{
		item.Title,
		item.SubTitle,
		joinNonEmpty(item.Title, item.SubTitle),
	}
	entryNames := []string{
		entry.Title,
		entry.OriginalTitle.String,
		entry.NameOriginal.String,
		entry.NameEn.String,
		entry.NameZh.String,
	}

	bestNameScore := 0.0
	for _, entryName := range entryNames {
		for _, candidateName := range candidateNames {
			sim := compareNameSimilarity(entryName, candidateName)
			if sim > bestNameScore {
				bestNameScore = sim
			}
		}
	}
	score += bestNameScore * 0.63

	if containsHan(item.Title) && !entry.NameZh.Valid {
		score += 0.03
	}

	return score
}

func extractYearFromText(value string) int {
	match := yearRegex.FindString(value)
	if match == "" {
		return 0
	}
	year, _ := strconv.Atoi(match)
	return year
}

func compareNameSimilarity(left, right string) float64 {
	leftVariants := buildTitleVariants(left)
	rightVariants := buildTitleVariants(right)
	if len(leftVariants) == 0 || len(rightVariants) == 0 {
		return 0
	}

	best := 0.0
	for _, l := range leftVariants {
		for _, r := range rightVariants {
			sim := stringSimilarity(l, r)
			if sim > best {
				best = sim
			}

			leftLatin := normalizeLatinComparable(l)
			rightLatin := normalizeLatinComparable(r)
			if leftLatin == "" || rightLatin == "" {
				continue
			}
			if strings.Contains(leftLatin, rightLatin) || strings.Contains(rightLatin, leftLatin) {
				boosted := sim + 0.22
				if boosted > 1 {
					boosted = 1
				}
				if boosted > best {
					best = boosted
				}
			}
		}
	}

	return best
}

func stringSimilarity(left, right string) float64 {
	left = normalizeComparableText(left)
	right = normalizeComparableText(right)
	if left == "" || right == "" {
		return 0
	}
	if left == right {
		return 1
	}

	distance := levenshtein.ComputeDistance(left, right)
	maxLen := max(len([]rune(left)), len([]rune(right)))
	if maxLen == 0 {
		return 0
	}

	score := 1 - (float64(distance) / float64(maxLen))
	if score < 0 {
		return 0
	}
	return score
}

func normalizeComparableText(value string) string {
	value = strings.ToLower(stripFormatChars(cleanText(value)))
	var b strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeLatinComparable(value string) string {
	value = strings.ToLower(stripFormatChars(cleanText(value)))
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func buildTitleVariants(value string) []string {
	value = stripFormatChars(cleanText(value))
	if value == "" {
		return nil
	}

	candidates := []string{
		value,
		strings.TrimSpace(bracketContentRegex.ReplaceAllString(value, " ")),
		strings.TrimSpace(yearRegex.ReplaceAllString(value, " ")),
		strings.TrimSpace(yearRegex.ReplaceAllString(bracketContentRegex.ReplaceAllString(value, " "), " ")),
	}

	parts := multiDividerSplitReg.Split(value, -1)
	for _, part := range parts {
		part = cleanText(part)
		if part != "" {
			candidates = append(candidates, part)
		}
	}

	if latin := extractLatinPhrase(value); latin != "" {
		candidates = append(candidates, latin, strings.TrimSpace(yearRegex.ReplaceAllString(latin, " ")))
	}
	if han := extractHanPhrase(value); han != "" {
		candidates = append(candidates, han)
	}

	result := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = cleanText(stripFormatChars(candidate))
		if len([]rune(candidate)) < 2 {
			continue
		}
		key := normalizeComparableText(candidate)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, candidate)
	}

	return result
}

func extractLatinPhrase(value string) string {
	var b strings.Builder
	lastWasSpace := false
	for _, r := range value {
		isLatin := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		isDigit := r >= '0' && r <= '9'
		if isLatin || isDigit || r == '\'' || r == '’' {
			b.WriteRune(r)
			lastWasSpace = false
			continue
		}
		if unicode.IsSpace(r) && !lastWasSpace && b.Len() > 0 {
			b.WriteRune(' ')
			lastWasSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func extractHanPhrase(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func stripFormatChars(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.Is(unicode.Cf, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func joinNonEmpty(values ...string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		normalized := cleanText(value)
		if normalized != "" {
			parts = append(parts, normalized)
		}
	}
	return strings.Join(parts, " ")
}

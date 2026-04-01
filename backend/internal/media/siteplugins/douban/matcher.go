package douban

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/agnivade/levenshtein"
	"github.com/nigowl/bitmagnet/internal/model"
)

var (
	yearRegex            = regexp.MustCompile(`(?:19|20)\d{2}`)
	bracketContentRegex  = regexp.MustCompile(`[（(［\[\{【][^）)］\]\}】]*[）)］\]\}】]`)
	multiDividerSplitReg = regexp.MustCompile(`[|/·•,;；]+`)
	titleNormalizeReg    = regexp.MustCompile(`[|/·•,:：;；]+`)
	multiSpaceRegex      = regexp.MustCompile(`\s+`)
	subjectDataRegex     = regexp.MustCompile(`(?s)window\.__DATA__\s*=\s*(\{.*?\})\s*;`)
	doubanResultSplitReg = regexp.MustCompile(`(?s)<div[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>`)
	doubanSIDReg         = regexp.MustCompile(`sid["']?\s*[:=]\s*["']?(\d+)`)
	doubanTitleReg       = regexp.MustCompile(`(?s)<h3[^>]*>\s*<span>\[([^\]]+)\]</span>\s*(?:&nbsp;|\s)*<a[^>]*>(.*?)</a>`)
	doubanCastReg        = regexp.MustCompile(`(?s)<span class="subject-cast">(.*?)</span>`)
	doubanBlockedReg     = regexp.MustCompile(`(?i)(登录跳转|异常请求|invalid_apikey|apikey_is_blocked|sec\.douban\.com|accounts\.douban\.com)`)
	htmlTagRegex         = regexp.MustCompile(`<[^>]+>`)
)

var errDoubanAccessBlocked = errors.New("douban access blocked")

type matcher struct {
	suggestURL   string
	searchURL    string
	webSearchURL string
	minScore     float64
	cookie       string
	userAgent    string
	referer      string
	acceptLang   string
	client       *http.Client
}

type suggestItem struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	SubTitle string `json:"sub_title"`
	Year     string `json:"year"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

type matchResult struct {
	ID       string
	Title    string
	SubTitle string
	Score    float64
}

type subjectSearchPayload struct {
	Items []subjectSearchItem `json:"items"`
}

type subjectSearchItem struct {
	ID       any    `json:"id"`
	Title    string `json:"title"`
	Abstract string `json:"abstract"`
	MoreURL  string `json:"more_url"`
	URL      string `json:"url"`
}

func newMatcher(cfg Config) *matcher {
	if !cfg.Enabled {
		return nil
	}

	suggestURL := strings.TrimSpace(cfg.SuggestURL)
	if suggestURL == "" {
		suggestURL = "https://movie.douban.com/j/subject_suggest"
	}

	searchURL := strings.TrimSpace(cfg.SearchURL)
	if searchURL == "" {
		searchURL = "https://movie.douban.com/subject_search"
	}

	webSearchURL := "https://www.douban.com/search"

	minScore := cfg.MinScore
	if minScore <= 0 {
		minScore = 0.62
	}

	timeout := cfg.HTTPTimeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	userAgent := strings.TrimSpace(cfg.UserAgent)
	if userAgent == "" {
		userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
	}

	referer := strings.TrimSpace(cfg.Referer)
	if referer == "" {
		referer = "https://movie.douban.com/"
	}

	acceptLang := strings.TrimSpace(cfg.AcceptLanguage)
	if acceptLang == "" {
		acceptLang = "zh-CN,zh;q=0.9,en;q=0.8"
	}

	return &matcher{
		suggestURL:   suggestURL,
		searchURL:    searchURL,
		webSearchURL: webSearchURL,
		minScore:     minScore,
		cookie:       strings.TrimSpace(cfg.Cookie),
		userAgent:    userAgent,
		referer:      referer,
		acceptLang:   acceptLang,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (m *matcher) match(ctx context.Context, entry model.MediaEntry) (matchResult, bool, error) {
	if m == nil {
		return matchResult{}, false, nil
	}

	queries := m.buildQueries(entry)
	if len(queries) == 0 {
		return matchResult{}, false, nil
	}

	candidatesByID := make(map[string]suggestItem)
	blockedReasons := make(map[string]struct{})
	nonBlockedSeen := false
	recordErr := func(err error) {
		if err == nil {
			nonBlockedSeen = true
			return
		}
		if errors.Is(err, errDoubanAccessBlocked) {
			reason := strings.TrimSpace(strings.TrimPrefix(err.Error(), errDoubanAccessBlocked.Error()+":"))
			if reason == "" {
				reason = cleanText(err.Error())
			}
			blockedReasons[reason] = struct{}{}
			return
		}
		nonBlockedSeen = true
	}

	for _, query := range queries {
		items, err := m.suggest(ctx, query)
		recordErr(err)
		if err != nil || len(items) == 0 {
			if fallbackItems, fallbackErr := m.subjectSearch(ctx, query); fallbackErr == nil && len(fallbackItems) > 0 {
				recordErr(fallbackErr)
				items = fallbackItems
			} else {
				recordErr(fallbackErr)
			}
		}
		if len(items) == 0 {
			if webItems, webErr := m.webSearch(ctx, query); webErr == nil && len(webItems) > 0 {
				recordErr(webErr)
				items = webItems
			} else {
				recordErr(webErr)
			}
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
		if len(blockedReasons) > 0 && !nonBlockedSeen {
			reasons := make([]string, 0, len(blockedReasons))
			for reason := range blockedReasons {
				reasons = append(reasons, reason)
			}
			return matchResult{}, false, fmt.Errorf("%w: %s", errDoubanAccessBlocked, strings.Join(reasons, "; "))
		}
		return matchResult{}, false, nil
	}

	best := matchResult{}
	found := false
	for _, candidate := range candidatesByID {
		score := m.score(entry, candidate)
		if !found || score > best.Score {
			best = matchResult{
				ID:       candidate.ID,
				Title:    cleanText(candidate.Title),
				SubTitle: cleanText(candidate.SubTitle),
				Score:    score,
			}
			found = true
		}
	}

	if !found || best.Score < m.minScore {
		return matchResult{}, false, nil
	}

	return best, true, nil
}

func (m *matcher) suggest(ctx context.Context, query string) ([]suggestItem, error) {
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

	req, err := m.newRequest(ctx, endpoint.String(), "application/json,text/plain,*/*")
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if isDoubanBlocked(resp, body) {
		return nil, blockedError("suggest", resp, body)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("douban suggest request failed: %s", resp.Status)
	}

	var items []suggestItem
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (m *matcher) subjectSearch(ctx context.Context, query string) ([]suggestItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	endpoint, err := url.Parse(m.searchURL)
	if err != nil {
		return nil, err
	}

	params := endpoint.Query()
	params.Set("search_text", query)
	params.Set("cat", "1002")
	endpoint.RawQuery = params.Encode()

	req, err := m.newRequest(ctx, endpoint.String(), "text/html,application/xhtml+xml")
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if isDoubanBlocked(resp, body) {
		return nil, blockedError("subject_search", resp, body)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("douban subject_search request failed: %s", resp.Status)
	}

	return parseSubjectSearchResults(body)
}

func parseSubjectSearchResults(body []byte) ([]suggestItem, error) {
	matches := subjectDataRegex.FindSubmatch(body)
	if len(matches) < 2 {
		return nil, nil
	}

	var payload subjectSearchPayload
	if err := json.Unmarshal(matches[1], &payload); err != nil {
		return nil, err
	}

	results := make([]suggestItem, 0, len(payload.Items))
	for _, raw := range payload.Items {
		id := normalizeSubjectID(raw.ID)
		if id == "" {
			continue
		}

		itemType := "movie"
		if strings.Contains(raw.MoreURL, "is_tv:'1'") {
			itemType = "tv"
		}

		results = append(results, suggestItem{
			ID:       id,
			Title:    cleanText(raw.Title),
			SubTitle: cleanText(raw.Abstract),
			Year:     strconv.Itoa(extractYearFromText(raw.Title)),
			Type:     itemType,
			URL:      strings.TrimSpace(raw.URL),
		})
	}

	return results, nil
}

func (m *matcher) webSearch(ctx context.Context, query string) ([]suggestItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	endpoint, err := url.Parse(m.webSearchURL)
	if err != nil {
		return nil, err
	}
	params := endpoint.Query()
	params.Set("cat", "1002")
	params.Set("q", query)
	endpoint.RawQuery = params.Encode()

	req, err := m.newRequest(ctx, endpoint.String(), "text/html,application/xhtml+xml")
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if isDoubanBlocked(resp, body) {
		return nil, blockedError("web_search", resp, body)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("douban search request failed: %s", resp.Status)
	}

	return parseWebSearchResults(body), nil
}

func parseWebSearchResults(body []byte) []suggestItem {
	chunks := doubanResultSplitReg.Split(string(body), -1)
	if len(chunks) <= 1 {
		return nil
	}

	items := make([]suggestItem, 0, len(chunks)-1)
	for _, chunk := range chunks[1:] {
		sidMatch := doubanSIDReg.FindStringSubmatch(chunk)
		if len(sidMatch) < 2 {
			continue
		}
		id := extractDigits(sidMatch[1])
		if id == "" {
			continue
		}

		titleMatch := doubanTitleReg.FindStringSubmatch(chunk)
		if len(titleMatch) < 3 {
			continue
		}
		label := decodeHTMLText(titleMatch[1])
		title := decodeHTMLText(titleMatch[2])

		subTitle := ""
		castText := ""
		if castMatch := doubanCastReg.FindStringSubmatch(chunk); len(castMatch) >= 2 {
			castText = decodeHTMLText(castMatch[1])
			if originalTitle := extractOriginalTitle(castText); originalTitle != "" {
				subTitle = originalTitle
			} else {
				subTitle = castText
			}
		}

		itemType := "movie"
		if strings.Contains(label, "电视剧") || strings.Contains(strings.ToLower(label), "tv") {
			itemType = "tv"
		}

		year := extractYearFromText(title)
		if year == 0 {
			year = extractYearFromText(castText)
		}

		items = append(items, suggestItem{
			ID:       id,
			Title:    title,
			SubTitle: subTitle,
			Year:     strconv.Itoa(year),
			Type:     itemType,
			URL:      "https://movie.douban.com/subject/" + id + "/",
		})
	}

	return items
}

func normalizeSubjectID(value any) string {
	switch v := value.(type) {
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case string:
		return extractDigits(v)
	case json.Number:
		return extractDigits(v.String())
	default:
		return ""
	}
}

func decodeHTMLText(value string) string {
	value = html.UnescapeString(value)
	value = htmlTagRegex.ReplaceAllString(value, " ")
	return cleanText(value)
}

func extractOriginalTitle(subjectCast string) string {
	subjectCast = cleanText(subjectCast)
	if subjectCast == "" {
		return ""
	}

	lower := strings.ToLower(subjectCast)
	prefixes := []string{"原名:", "原名：", "original title:", "original title："}
	for _, prefix := range prefixes {
		if !strings.HasPrefix(lower, strings.ToLower(prefix)) {
			continue
		}
		rest := cleanText(subjectCast[len(prefix):])
		if rest == "" {
			return ""
		}
		parts := strings.Split(rest, " / ")
		return cleanText(parts[0])
	}

	return ""
}

func (m *matcher) buildQueries(entry model.MediaEntry) []string {
	seedNames := []string{
		strings.TrimSpace(entry.NameZh.String),
		strings.TrimSpace(entry.Title),
		strings.TrimSpace(entry.NameOriginal.String),
		strings.TrimSpace(entry.NameEn.String),
	}
	seedNames = append(seedNames, entry.TitleAliases...)
	if zh, en := cleanText(entry.NameZh.String), cleanText(entry.NameEn.String); zh != "" && en != "" && normalizeComparableText(zh) != normalizeComparableText(en) {
		seedNames = append(seedNames, zh+" "+en, en+" "+zh)
	}

	queries := make([]string, 0, 32)
	for _, name := range seedNames {
		for _, variant := range buildTitleVariants(name) {
			queries = append(queries, expandSearchQuery(variant)...)
		}
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
		if len(result) >= 18 {
			break
		}
	}
	return result
}

func expandSearchQuery(query string) []string {
	base := cleanText(stripFormatChars(query))
	if base == "" {
		return nil
	}

	candidates := []string{
		base,
		strings.TrimSpace(titleNormalizeReg.ReplaceAllString(base, " ")),
		strings.TrimSpace(strings.ReplaceAll(base, "：", ":")),
		strings.TrimSpace(strings.ReplaceAll(base, ":", "：")),
		strings.TrimSpace(strings.ReplaceAll(base, "-", " ")),
	}

	for _, sep := range []string{":", "：", " - ", " – ", " — ", "-"} {
		idx := strings.Index(base, sep)
		if idx <= 0 {
			continue
		}
		prefix := cleanText(base[:idx])
		if len([]rune(prefix)) >= 4 {
			candidates = append(candidates, prefix)
		}
	}

	out := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = cleanText(candidate)
		if candidate == "" {
			continue
		}
		key := normalizeComparableText(candidate)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, candidate)
	}
	return out
}

func (m *matcher) score(entry model.MediaEntry, item suggestItem) float64 {
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

	if score > 1 {
		return 1
	}
	if score < 0 {
		return 0
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
		strings.TrimSpace(titleNormalizeReg.ReplaceAllString(value, " ")),
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

func cleanText(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return multiSpaceRegex.ReplaceAllString(trimmed, " ")
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

func (m *matcher) newRequest(ctx context.Context, endpoint, accept string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	req.Header.Set("User-Agent", m.userAgent)
	req.Header.Set("Accept-Language", m.acceptLang)
	if m.referer != "" {
		req.Header.Set("Referer", m.referer)
	}
	if m.cookie != "" {
		req.Header.Set("Cookie", m.cookie)
	}
	return req, nil
}

func isDoubanBlocked(resp *http.Response, body []byte) bool {
	if resp != nil {
		location := strings.ToLower(strings.TrimSpace(resp.Header.Get("Location")))
		if strings.Contains(location, "sec.douban.com") || strings.Contains(location, "accounts.douban.com") {
			return true
		}
		if resp.Request != nil && resp.Request.URL != nil {
			host := strings.ToLower(strings.TrimSpace(resp.Request.URL.Host))
			if strings.Contains(host, "sec.douban.com") || strings.Contains(host, "accounts.douban.com") {
				return true
			}
		}
	}
	return doubanBlockedReg.Match(body)
}

func blockedError(endpoint string, resp *http.Response, body []byte) error {
	if resp != nil && resp.Request != nil && resp.Request.URL != nil {
		return fmt.Errorf("%w: %s blocked by %s", errDoubanAccessBlocked, endpoint, resp.Request.URL.Host)
	}
	return fmt.Errorf("%w: %s blocked", errDoubanAccessBlocked, endpoint)
}

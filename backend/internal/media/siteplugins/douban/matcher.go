package douban

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

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

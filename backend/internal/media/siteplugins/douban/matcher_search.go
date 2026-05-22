package douban

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

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

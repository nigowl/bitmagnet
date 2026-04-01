package douban

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/bitmagnet-io/bitmagnet/internal/model"
)

func TestMatcherScore_MixedTitleWithYearInName(t *testing.T) {
	m := &matcher{minScore: 0.62}

	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "The Boy with My Son's Face 2026",
		NameEn:      model.NewNullString("The Boy with My Son's Face"),
		NameZh:      model.NewNullString("同脸诡影"),
		ReleaseYear: model.Year(2026),
	}

	candidate := suggestItem{
		ID:    "36845482",
		Title: "同脸诡影 The Boy with My Son's Face‎ (2026)",
		Type:  "movie",
	}

	score := m.score(entry, candidate)
	if score < m.minScore {
		t.Fatalf("expected score >= %.2f, got %.4f", m.minScore, score)
	}
}

func TestBuildTitleVariants_ExtractsHanAndLatinVariants(t *testing.T) {
	variants := buildTitleVariants("同脸诡影 The Boy with My Son's Face‎ (2026)")
	if len(variants) == 0 {
		t.Fatalf("expected variants, got none")
	}

	hasHan := false
	hasLatin := false
	for _, variant := range variants {
		if normalizeComparableText(variant) == normalizeComparableText("同脸诡影") {
			hasHan = true
		}
		if normalizeComparableText(variant) == normalizeComparableText("The Boy with My Son's Face") {
			hasLatin = true
		}
	}

	if !hasHan {
		t.Fatalf("expected han variant, got %#v", variants)
	}
	if !hasLatin {
		t.Fatalf("expected latin variant, got %#v", variants)
	}
}

func TestMatcherScore_AvatarMixedZhEnTitle(t *testing.T) {
	m := &matcher{minScore: 0.62}

	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "Avatar: Fire and Ash",
		NameEn:      model.NewNullString("Avatar: Fire and Ash"),
		ReleaseYear: model.Year(2025),
	}

	candidate := suggestItem{
		ID:    "5348089",
		Title: "阿凡达：火与烬 Avatar: Fire and Ash\u200e (2025)",
		Type:  "movie",
	}

	score := m.score(entry, candidate)
	if score < m.minScore {
		t.Fatalf("expected score >= %.2f, got %.4f", m.minScore, score)
	}
}

func TestMatch_FallbackToSubjectSearchWhenSuggestIsEmpty(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		switch r.URL.Path {
		case "/j/subject_suggest":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
			return
		case "/subject_search":
			title := `阿凡达：火与烬 Avatar: Fire and Ash\u200e (2025)`
			payload := fmt.Sprintf(`{"count":15,"items":[{"id":5348089,"title":"%s","more_url":"is_tv:'0'","url":"https://movie.douban.com/subject/5348089/"}],"total":1}`, title)
			html := "<html><script>window.__DATA__ = " + payload + ";</script></html>"
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(html))
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	m := newMatcher(Config{
		Enabled:    true,
		SuggestURL: server.URL + "/j/subject_suggest",
		SearchURL:  server.URL + "/subject_search",
		MinScore:   0.62,
	})

	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "Avatar: Fire and Ash",
		NameEn:      model.NewNullString("Avatar: Fire and Ash"),
		ReleaseYear: model.Year(2025),
	}

	match, ok, err := m.match(context.Background(), entry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatalf("expected a match from subject_search fallback")
	}
	if match.ID != "5348089" {
		t.Fatalf("expected id 5348089, got %s", match.ID)
	}

	joined := strings.Join(calls, " ")
	if !strings.Contains(joined, "/j/subject_suggest") || !strings.Contains(joined, "/subject_search") {
		t.Fatalf("expected both suggest and subject_search calls, got %v", calls)
	}
}

func TestParseSubjectSearchResults(t *testing.T) {
	body := []byte(`<html><script>window.__DATA__ = {"items":[{"id":"5348089","title":"阿凡达：火与烬 Avatar: Fire and Ash‎ (2025)","more_url":"is_tv:'0'","url":"https://movie.douban.com/subject/5348089/"}]};</script></html>`)
	items, err := parseSubjectSearchResults(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].ID != "5348089" {
		t.Fatalf("expected id 5348089, got %s", items[0].ID)
	}
}

func TestBuildTitleVariants_AddsDividerNormalizedVariant(t *testing.T) {
	variants := buildTitleVariants("Avatar: Fire and Ash")
	expected := normalizeComparableText("Avatar Fire and Ash")
	for _, variant := range variants {
		if normalizeComparableText(variant) == expected {
			return
		}
	}
	t.Fatalf("expected normalized variant %q in %#v", expected, variants)
}

func TestSubjectSearchURLContainsCat1002(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/subject_search" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("cat"); got != "1002" {
			t.Fatalf("expected cat=1002, got %q", got)
		}
		if got := r.URL.Query().Get("search_text"); got == "" {
			t.Fatalf("expected search_text query to be set")
		}
		_, _ = w.Write([]byte(`<html><script>window.__DATA__ = {"items":[]};</script></html>`))
	}))
	defer server.Close()

	m := &matcher{
		searchURL: server.URL + "/subject_search",
		client:    server.Client(),
	}
	if _, err := m.subjectSearch(context.Background(), "Avatar: Fire and Ash"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSubjectSearchPathEscapesQuery(t *testing.T) {
	captured := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.URL.RawQuery
		_, _ = w.Write([]byte(`<html><script>window.__DATA__ = {"items":[]};</script></html>`))
	}))
	defer server.Close()

	m := &matcher{
		searchURL: server.URL,
		client:    server.Client(),
	}
	if _, err := m.subjectSearch(context.Background(), "Avatar: Fire and Ash"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := url.ParseQuery(captured); err != nil {
		t.Fatalf("expected valid encoded query, got %q (%v)", captured, err)
	}
}

func TestMatch_FallbackToWebSearchWhenSubjectSearchEmpty(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		switch r.URL.Path {
		case "/j/subject_suggest":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
			return
		case "/subject_search":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><script>window.__DATA__ = {"items":[]};</script></html>`))
			return
		case "/search":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`
				<div class="result">
				  <div class="content">
				    <div class="title">
				      <h3><span>[电影]</span>&nbsp;<a>阿凡达：火与烬</a></h3>
				      <span class="subject-cast">原名:Avatar: Fire and Ash / 2025</span>
				    </div>
				  </div>
				  <a onclick="moreurl(this,{sid: 5348089})"></a>
				</div>`))
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	m := &matcher{
		suggestURL:   server.URL + "/j/subject_suggest",
		searchURL:    server.URL + "/subject_search",
		webSearchURL: server.URL + "/search",
		minScore:     0.62,
		client:       server.Client(),
	}

	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "Avatar: Fire and Ash",
		NameEn:      model.NewNullString("Avatar: Fire and Ash"),
		ReleaseYear: model.Year(2025),
	}

	match, ok, err := m.match(context.Background(), entry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatalf("expected a match from web search fallback")
	}
	if match.ID != "5348089" {
		t.Fatalf("expected id 5348089, got %s", match.ID)
	}

	joined := strings.Join(calls, " ")
	if !strings.Contains(joined, "/j/subject_suggest") || !strings.Contains(joined, "/subject_search") || !strings.Contains(joined, "/search") {
		t.Fatalf("expected suggest + subject_search + web search calls, got %v", calls)
	}
}

func TestParseWebSearchResults(t *testing.T) {
	body := []byte(`
	<div class="result">
	  <div class="content">
	    <div class="title">
	      <h3><span>[电影]</span>&nbsp;<a>阿凡达：火与烬</a></h3>
	      <span class="subject-cast">原名:Avatar: Fire and Ash / 2025</span>
	    </div>
	  </div>
	  <a onclick="moreurl(this,{sid: 5348089})"></a>
	</div>`)

	items := parseWebSearchResults(body)
	if len(items) != 1 {
		t.Fatalf("expected 1 parsed item, got %d", len(items))
	}
	if items[0].ID != "5348089" {
		t.Fatalf("expected id 5348089, got %s", items[0].ID)
	}
	if items[0].Type != "movie" {
		t.Fatalf("expected movie type, got %s", items[0].Type)
	}
	if items[0].SubTitle != "Avatar: Fire and Ash" {
		t.Fatalf("expected extracted original title subtitle, got %q", items[0].SubTitle)
	}
}

func TestScore_PrefersExactTitleOverSpinOff(t *testing.T) {
	m := &matcher{minScore: 0.62}
	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "Inception",
		NameEn:      model.NewNullString("Inception"),
		ReleaseYear: model.Year(2010),
	}

	mainCandidate := suggestItem{
		ID:       "3541415",
		Title:    "盗梦空间",
		SubTitle: "Inception",
		Year:     "2010",
		Type:     "movie",
	}
	spinOffCandidate := suggestItem{
		ID:       "30198890",
		Title:    "盗梦空间：行动开始",
		SubTitle: "Inception: Jump Right Into the Action",
		Year:     "2010",
		Type:     "movie",
	}

	mainScore := m.score(entry, mainCandidate)
	spinOffScore := m.score(entry, spinOffCandidate)
	if mainScore <= spinOffScore {
		t.Fatalf("expected main candidate score > spinoff score, got main=%.4f spinoff=%.4f", mainScore, spinOffScore)
	}
}

func TestSuggest_ReturnsBlockedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/j/subject_suggest":
			http.Redirect(w, r, "/sec", http.StatusFound)
		case "/sec":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><title>豆瓣 - 登录跳转页</title><body>有异常请求从你的 IP 发出，请登录使用豆瓣</body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	m := &matcher{
		suggestURL: server.URL + "/j/subject_suggest",
		client:     server.Client(),
		userAgent:  "test-agent",
		acceptLang: "zh-CN,zh;q=0.9",
	}

	_, err := m.suggest(context.Background(), "Avatar: Fire and Ash")
	if err == nil {
		t.Fatalf("expected blocked error")
	}
	if !errors.Is(err, errDoubanAccessBlocked) {
		t.Fatalf("expected access blocked error, got %v", err)
	}
}

func TestBuildQueries_IncludeColonPrefixVariant(t *testing.T) {
	m := &matcher{}
	entry := model.MediaEntry{
		Title:       "Avatar: Fire and Ash",
		NameEn:      model.NewNullString("Avatar: Fire and Ash"),
		ReleaseYear: model.Year(2025),
	}

	queries := m.buildQueries(entry)
	wantPrefix := normalizeComparableText("Avatar")
	hasPrefix := false
	for _, query := range queries {
		if normalizeComparableText(query) == wantPrefix {
			hasPrefix = true
			break
		}
	}
	if !hasPrefix {
		t.Fatalf("expected query variants to include colon-prefix Avatar, got %#v", queries)
	}
}

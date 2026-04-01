//go:build integration

package douban

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
)

func TestLiveBatchMatchSampleTitles(t *testing.T) {
	m := newMatcher(Config{
		Enabled:        true,
		SuggestURL:     "https://movie.douban.com/j/subject_suggest",
		SearchURL:      "https://movie.douban.com/subject_search",
		MinScore:       0.62,
		HTTPTimeout:    20 * time.Second,
		Cookie:         os.Getenv("DOUBAN_COOKIE"),
		UserAgent:      os.Getenv("DOUBAN_USER_AGENT"),
		AcceptLanguage: os.Getenv("DOUBAN_ACCEPT_LANGUAGE"),
		Referer:        os.Getenv("DOUBAN_REFERER"),
	})

	cases := []struct {
		Title       string
		ReleaseYear int
		Type        model.ContentType
	}{
		{Title: "Avatar: Fire and Ash", ReleaseYear: 2025, Type: model.ContentTypeMovie},
		{Title: "The Boy with My Son's Face", ReleaseYear: 2026, Type: model.ContentTypeMovie},
		{Title: "Mission: Impossible - The Final Reckoning", ReleaseYear: 2025, Type: model.ContentTypeMovie},
		{Title: "Dune: Part Two", ReleaseYear: 2024, Type: model.ContentTypeMovie},
		{Title: "The Last of Us", ReleaseYear: 2023, Type: model.ContentTypeTvShow},
		{Title: "Interstellar", ReleaseYear: 2014, Type: model.ContentTypeMovie},
		{Title: "Inception", ReleaseYear: 2010, Type: model.ContentTypeMovie},
		{Title: "Breaking Bad", ReleaseYear: 2008, Type: model.ContentTypeTvShow},
		{Title: "Black Mirror", ReleaseYear: 2011, Type: model.ContentTypeTvShow},
		{Title: "Shogun", ReleaseYear: 2024, Type: model.ContentTypeTvShow},
	}

	matched := 0
	for _, c := range cases {
		entry := model.MediaEntry{
			ContentType: c.Type,
			Title:       c.Title,
			NameEn:      model.NewNullString(c.Title),
		}
		if c.ReleaseYear > 0 {
			entry.ReleaseYear = model.Year(c.ReleaseYear)
		}

		match, ok, err := m.match(context.Background(), entry)
		if err != nil {
			t.Logf("MISS %s (%d): error=%v", c.Title, c.ReleaseYear, err)
			continue
		}
		if !ok {
			t.Logf("MISS %s (%d): no candidate above score threshold", c.Title, c.ReleaseYear)
			continue
		}

		matched++
		t.Logf("MATCH %s (%d) -> id=%s score=%.4f title=%s", c.Title, c.ReleaseYear, match.ID, match.Score, match.Title)
	}

	t.Logf("summary: matched %d/%d", matched, len(cases))
}

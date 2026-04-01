package douban

import (
	"context"
	"fmt"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
)

type TestInput struct {
	Title       string
	Year        int
	ContentType string
}

type TestCandidate struct {
	Source   string  `json:"source"`
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	SubTitle string  `json:"subTitle,omitempty"`
	Score    float64 `json:"score"`
}

type TestResult struct {
	Queries    []string        `json:"queries"`
	Candidates []TestCandidate `json:"candidates"`
	Matched    *TestCandidate  `json:"matched,omitempty"`
	Logs       []string        `json:"logs"`
}

func TestMatch(ctx context.Context, config Config, input TestInput) (TestResult, error) {
	m := newMatcher(config)
	if m == nil {
		return TestResult{
			Logs: []string{"douban plugin disabled"},
		}, nil
	}

	entry := model.MediaEntry{
		ContentType: toContentType(input.ContentType),
		Title:       strings.TrimSpace(input.Title),
		NameOriginal: func() model.NullString {
			title := strings.TrimSpace(input.Title)
			if title == "" {
				return model.NullString{}
			}
			return model.NewNullString(title)
		}(),
	}
	if input.Year > 0 {
		entry.ReleaseYear = model.Year(input.Year)
	}

	queries := m.buildQueries(entry)
	result := TestResult{
		Queries: queries,
		Logs:    make([]string, 0, 16),
	}
	if len(queries) == 0 {
		result.Logs = append(result.Logs, "no query generated for current input")
		return result, nil
	}

	candidatesByID := make(map[string]suggestItem)
	candidateSource := make(map[string]string)
	for _, query := range queries {
		items, err := m.suggest(ctx, query)
		if err != nil {
			result.Logs = append(result.Logs, fmt.Sprintf("suggest failed for %q: %v", query, err))
		} else {
			result.Logs = append(result.Logs, fmt.Sprintf("suggest success for %q: %d items", query, len(items)))
		}

		if len(items) == 0 {
			fallbackItems, fallbackErr := m.subjectSearch(ctx, query)
			if fallbackErr != nil {
				result.Logs = append(result.Logs, fmt.Sprintf("subject_search failed for %q: %v", query, fallbackErr))
			} else {
				result.Logs = append(result.Logs, fmt.Sprintf("subject_search success for %q: %d items", query, len(fallbackItems)))
				items = fallbackItems
				for _, item := range fallbackItems {
					id := extractDigits(item.ID)
					if id == "" {
						continue
					}
					candidateSource[id] = "subject_search"
				}
			}
		}
		if len(items) == 0 {
			webItems, webErr := m.webSearch(ctx, query)
			if webErr != nil {
				result.Logs = append(result.Logs, fmt.Sprintf("web_search failed for %q: %v", query, webErr))
			} else {
				result.Logs = append(result.Logs, fmt.Sprintf("web_search success for %q: %d items", query, len(webItems)))
				items = webItems
				for _, item := range webItems {
					id := extractDigits(item.ID)
					if id == "" {
						continue
					}
					candidateSource[id] = "web_search"
				}
			}
		}

		for _, item := range items {
			id := extractDigits(item.ID)
			if id == "" {
				continue
			}
			item.ID = id
			if _, exists := candidateSource[id]; !exists {
				candidateSource[id] = "suggest"
			}
			candidatesByID[id] = item
		}
	}

	best := TestCandidate{Score: -1}
	for _, candidate := range candidatesByID {
		score := m.score(entry, candidate)
		row := TestCandidate{
			Source:   candidateSource[candidate.ID],
			ID:       candidate.ID,
			Title:    cleanText(candidate.Title),
			SubTitle: cleanText(candidate.SubTitle),
			Score:    score,
		}
		result.Candidates = append(result.Candidates, row)
		if row.Score > best.Score {
			best = row
		}
	}

	if len(result.Candidates) == 0 {
		result.Logs = append(result.Logs, "no candidate found")
		return result, nil
	}
	if best.Score >= m.minScore {
		result.Matched = &best
		result.Logs = append(result.Logs, fmt.Sprintf("matched candidate %s with score %.4f", best.ID, best.Score))
	} else {
		result.Logs = append(result.Logs, fmt.Sprintf("best score %.4f below threshold %.4f", best.Score, m.minScore))
	}

	return result, nil
}

func toContentType(value string) model.ContentType {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "tv", "series", "show", "tv_show":
		return model.ContentTypeTvShow
	default:
		return model.ContentTypeMovie
	}
}

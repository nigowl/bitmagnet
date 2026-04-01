package media

import (
	"testing"

	"github.com/bitmagnet-io/bitmagnet/internal/model"
)

func TestDoubanMatcherScore_MixedTitleWithYearInName(t *testing.T) {
	matcher := &doubanMatcher{minScore: 0.62}

	entry := model.MediaEntry{
		ContentType: model.ContentTypeMovie,
		Title:       "The Boy with My Son's Face 2026",
		NameEn:      model.NewNullString("The Boy with My Son's Face"),
		NameZh:      model.NewNullString("同脸诡影"),
		ReleaseYear: model.Year(2026),
	}

	candidate := doubanSuggestItem{
		ID:    "36845482",
		Title: "同脸诡影 The Boy with My Son's Face‎ (2026)",
		Type:  "movie",
	}

	score := matcher.score(entry, candidate)
	if score < matcher.minScore {
		t.Fatalf("expected score >= %.2f, got %.4f", matcher.minScore, score)
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

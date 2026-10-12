package media

import (
	"testing"

	"github.com/nigowl/bitmagnet/internal/model"
)

func TestTopicIDsUseStablePrefixes(t *testing.T) {
	t.Parallel()

	if got, want := franchiseTopicID("tmdb", "123"), "franchise:tmdb:123"; got != want {
		t.Fatalf("franchise topic id changed: got %q want %q", got, want)
	}
}

func TestTopicOrderBy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  string
	}{
		{input: "", want: "sort_order DESC, item_count DESC, updated_at DESC, id ASC"},
		{input: "updated", want: "sort_order DESC, updated_at DESC, id ASC"},
		{input: "name", want: "sort_order DESC, name ASC, id ASC"},
		{input: "members", want: "sort_order DESC, item_count DESC, updated_at DESC, id ASC"},
		{input: "unknown", want: "sort_order DESC, item_count DESC, updated_at DESC, id ASC"},
	}

	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			if got := topicOrderBy(test.input); got != test.want {
				t.Fatalf("topicOrderBy(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestTopicSortWeightKeepsSeriesAtOne(t *testing.T) {
	t.Parallel()

	if got := topicSortWeight(topicKindFranchise, "series", 1001); got != 1 {
		t.Fatalf("topicSortWeight() = %d, want 1", got)
	}
	if got := topicSortWeight(topicKindCustom, "custom", 1001); got != 1001 {
		t.Fatalf("topicSortWeight() custom = %d, want 1001", got)
	}
}

func TestNormalizeTopicMediaIDs(t *testing.T) {
	t.Parallel()

	got := normalizeTopicMediaIDs([]string{" media-1 ", "media-1", "", "media-2"})
	want := []string{"media-1", "media-2"}
	if len(got) != len(want) {
		t.Fatalf("normalizeTopicMediaIDs() = %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("normalizeTopicMediaIDs() = %#v, want %#v", got, want)
		}
	}
}

func TestNormalizeTopicInputMediaIDsAreOptional(t *testing.T) {
	t.Parallel()

	input := TopicAdminInput{Name: "Topic", SortOrder: 1}
	_, _, mediaIDs, provided, err := normalizeTopicInput(input)
	if err != nil {
		t.Fatalf("normalizeTopicInput() returned error: %v", err)
	}
	if provided || len(mediaIDs) != 0 {
		t.Fatalf("normalizeTopicInput() omitted mediaIds = %#v, provided=%v", mediaIDs, provided)
	}

	ids := []string{"media-1", "media-1", " media-2 "}
	input.MediaIDs = &ids
	_, _, mediaIDs, provided, err = normalizeTopicInput(input)
	if err != nil {
		t.Fatalf("normalizeTopicInput() returned error: %v", err)
	}
	if !provided {
		t.Fatal("normalizeTopicInput() did not mark mediaIds as provided")
	}
	want := []string{"media-1", "media-2"}
	if len(mediaIDs) != len(want) || mediaIDs[0] != want[0] || mediaIDs[1] != want[1] {
		t.Fatalf("normalizeTopicInput() mediaIds = %#v, want %#v", mediaIDs, want)
	}
}

func TestTopicNamePreservesExistingName(t *testing.T) {
	t.Parallel()

	names := map[string]string{"franchise:tmdb: Bond": "007系列"}
	if got := topicName(names, "franchise:tmdb: Bond", "James Bond Collection"); got != "007系列" {
		t.Fatalf("topicName() = %q, want %q", got, "007系列")
	}
	if got := topicName(names, "franchise:tmdb: Matrix", "黑客帝国系列"); got != "黑客帝国系列" {
		t.Fatalf("topicName() fallback = %q, want %q", got, "黑客帝国系列")
	}
}

func TestTopicContentChanged(t *testing.T) {
	t.Parallel()

	existing := model.MediaTopic{
		Kind:        topicKindFranchise,
		Module:      "series",
		Name:        "007系列",
		Description: "",
		SortOrder:   1001,
		ItemCount:   2,
		Enabled:     true,
	}
	if topicContentChanged(existing, topicKindFranchise, "series", "007系列", "", 1001, true, []string{"a", "b"}, []string{"a", "b"}) {
		t.Fatal("topicContentChanged() marked identical topic as changed")
	}
	if !topicContentChanged(existing, topicKindFranchise, "series", "007系列", "", 1001, true, []string{"b", "a"}, []string{"a", "b"}) {
		t.Fatal("topicContentChanged() ignored member order change")
	}
	if !topicContentChanged(existing, topicKindFranchise, "series", "007系列", "updated", 1001, true, []string{"a", "b"}, []string{"a", "b"}) {
		t.Fatal("topicContentChanged() ignored description change")
	}
}

func TestLocalizedFranchiseTopicName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		original  string
		localized string
		want      string
	}{
		{name: "localized", original: "The Matrix Collection", localized: "黑客帝国", want: "黑客帝国系列"},
		{name: "already suffixed", original: "Bond Collection", localized: "007系列", want: "007系列"},
		{name: "specific installment", original: "Pusher Collection", localized: "白领流氓3", want: "白领流氓系列"},
		{name: "specific subtitle", original: "The Adventures of Tintin Collection", localized: "丁丁历险记：丁丁与蓝橙子", want: "丁丁历险记系列"},
		{name: "numeric franchise identifier", original: "Cyborg 009 Collection", localized: "人造人009", want: "人造人009系列"},
		{name: "existing series before subtitle", original: "Privatdetektiv Hillman", localized: "侦探希尔曼系列：红衣模特", want: "侦探希尔曼系列"},
		{name: "no localized name", original: "Carry On Collection", localized: "", want: "Carry On Collection"},
		{name: "non Chinese localized name", original: "Bond Collection", localized: "James Bond", want: "Bond Collection"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := localizedFranchiseTopicName(test.original, test.localized); got != test.want {
				t.Fatalf("localizedFranchiseTopicName(%q, %q) = %q, want %q", test.original, test.localized, got, test.want)
			}
		})
	}
}

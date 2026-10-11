package media

import "testing"

func TestTopicIDsUseStablePrefixes(t *testing.T) {
	t.Parallel()

	if got, want := franchiseTopicID("tmdb", "123"), "franchise:tmdb:123"; got != want {
		t.Fatalf("franchise topic id changed: got %q want %q", got, want)
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

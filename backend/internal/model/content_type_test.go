package model

import "testing"

func TestNormalizeVideoContentType(t *testing.T) {
	tests := map[string]ContentType{
		"":         ContentTypeMovie,
		"movie":    ContentTypeMovie,
		"tv":       ContentTypeTvShow,
		" TV_SHOW": ContentTypeTvShow,
		"series":   ContentTypeTvShow,
		"show":     ContentTypeTvShow,
	}

	for input, expected := range tests {
		if got := NormalizeVideoContentType(input); got != expected {
			t.Fatalf("NormalizeVideoContentType(%q) = %q, want %q", input, got, expected)
		}
	}
}

package model

import "testing"

func TestNormalizeIMDbID(t *testing.T) {
	tests := map[string]string{
		"":              "",
		"abc":           "",
		"tt":            "",
		"1234567":       "tt1234567",
		" tt1234567 ":   "tt1234567",
		"tt123abc456":   "tt123456",
		"imdb: 7654321": "tt7654321",
	}

	for input, want := range tests {
		if got := NormalizeIMDbID(input); got != want {
			t.Fatalf("NormalizeIMDbID(%q) = %q, want %q", input, got, want)
		}
	}
}

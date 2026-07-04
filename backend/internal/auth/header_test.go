package auth

import "testing"

func TestBearerToken(t *testing.T) {
	tests := map[string]string{
		"":                 "",
		"Basic token":      "",
		"Bearer":           "",
		"Bearer token":     "token",
		"bearer token":     "token",
		"  BEARER token  ": "token",
		"Bearer   token":   "token",
	}

	for header, want := range tests {
		if got := BearerToken(header); got != want {
			t.Fatalf("BearerToken(%q) = %q, want %q", header, got, want)
		}
	}
}

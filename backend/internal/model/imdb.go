package model

import "strings"

func NormalizeIMDbID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	digits := imdbDigitsOnly(value)
	if digits == "" {
		return ""
	}
	return "tt" + digits
}

func imdbDigitsOnly(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

package auth

import "strings"

func BearerToken(authorizationHeader string) string {
	header := strings.TrimSpace(authorizationHeader)
	if header == "" {
		return ""
	}
	if len(header) < len("bearer ") || !strings.EqualFold(header[:len("bearer ")], "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}

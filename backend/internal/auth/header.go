package auth

import "strings"

func BearerToken(authorizationHeader string) string {
	header := strings.TrimSpace(authorizationHeader)
	if header == "" {
		return ""
	}
	if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}

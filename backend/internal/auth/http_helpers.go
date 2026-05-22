package auth

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	case errors.Is(err, ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, ErrInvalidInput):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
	case errors.Is(err, ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
	case errors.Is(err, ErrUserExists):
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
	case errors.Is(err, ErrInviteRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code is required"})
	case errors.Is(err, ErrInviteInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite code"})
	case errors.Is(err, ErrInviteExhausted):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code exhausted"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func parseRememberFor(value string) (time.Duration, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "":
		return 0, nil
	case "1d":
		return 24 * time.Hour, nil
	case "1w":
		return 7 * 24 * time.Hour, nil
	case "1m":
		return 30 * 24 * time.Hour, nil
	default:
		return 0, ErrInvalidInput
	}
}

func parseInt64Param(raw string) (int64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, ErrInvalidInput
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, err
	}
	return parsed, nil
}

func readAuthToken(c *gin.Context) string {
	token := strings.TrimSpace(BearerToken(c.GetHeader("Authorization")))
	if token != "" {
		return token
	}
	cookieToken, err := c.Cookie(authTokenCookieName)
	if err != nil {
		return ""
	}
	cookieToken = strings.TrimSpace(cookieToken)
	if cookieToken == "" {
		return ""
	}
	if decoded, decodeErr := url.QueryUnescape(cookieToken); decodeErr == nil {
		return strings.TrimSpace(decoded)
	}
	return cookieToken
}

func isMembershipProtectedPath(path string) bool {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return false
	}
	return strings.HasPrefix(trimmed, "/api/") || trimmed == "/graphql"
}

func isMembershipPublicPath(path string) bool {
	switch strings.TrimSpace(path) {
	case "/api/auth/login",
		"/api/auth/register",
		"/api/auth/settings":
		return true
	default:
		return false
	}
}

package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type tokenPayload struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Role     Role   `json:"role"`
	Exp      int64  `json:"exp"`
}

func buildToken(secret string, viewer Viewer, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		ttl = time.Hour
	}

	payload := tokenPayload{
		ID:       viewer.ID,
		Username: viewer.Username,
		Role:     viewer.Role,
		Exp:      time.Now().Add(ttl).Unix(),
	}
	encodedPayload, err := encodePayload(payload)
	if err != nil {
		return "", err
	}
	sig := signToken(secret, encodedPayload)
	return encodedPayload + "." + sig, nil
}

func parseToken(secret, token string) (Viewer, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Viewer{}, ErrUnauthorized
	}

	expectedSig := signToken(secret, parts[0])
	if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(expectedSig)) != 1 {
		return Viewer{}, ErrUnauthorized
	}

	payload, err := decodePayload(parts[0])
	if err != nil {
		return Viewer{}, ErrUnauthorized
	}

	if payload.Exp <= time.Now().Unix() {
		return Viewer{}, ErrUnauthorized
	}
	if payload.ID <= 0 || payload.Username == "" || (payload.Role != RoleAdmin && payload.Role != RoleUser) {
		return Viewer{}, ErrUnauthorized
	}

	return Viewer{
		ID:       payload.ID,
		Username: payload.Username,
		Role:     payload.Role,
	}, nil
}

func encodePayload(payload tokenPayload) (string, error) {
	bytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal token payload: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func decodePayload(input string) (tokenPayload, error) {
	bytes, err := base64.RawURLEncoding.DecodeString(input)
	if err != nil {
		return tokenPayload{}, err
	}
	var payload tokenPayload
	if err := json.Unmarshal(bytes, &payload); err != nil {
		return tokenPayload{}, err
	}
	return payload, nil
}

func signToken(secret, payload string) string {
	h := hmac.New(sha256.New, []byte(secret))
	_, _ = h.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

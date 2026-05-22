package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math/big"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9._-]{3,32}$`)
var inviteCodeRegex = regexp.MustCompile(`^[A-Z0-9_-]{4,64}$`)

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func normalizeUsername(username string) (string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if !usernameRegex.MatchString(username) {
		return "", ErrInvalidInput
	}
	return username, nil
}

func normalizeRole(role Role) (Role, error) {
	normalized := Role(strings.ToLower(strings.TrimSpace(string(role))))
	switch normalized {
	case RoleAdmin, RoleUser:
		return normalized, nil
	default:
		return "", ErrInvalidInput
	}
}

func validatePassword(password string) error {
	password = strings.TrimSpace(password)
	if len(password) < 8 {
		return ErrInvalidInput
	}
	return nil
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func verifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func generateInviteCode(length int, prefix string) (string, error) {
	if length < 4 || length > 64 {
		return "", ErrInvalidInput
	}
	normalizedPrefix := strings.ToUpper(strings.TrimSpace(prefix))
	if normalizedPrefix != "" && !inviteCodeRegex.MatchString(normalizedPrefix) {
		return "", ErrInvalidInput
	}
	if len(normalizedPrefix) >= length {
		return "", ErrInvalidInput
	}
	remain := length - len(normalizedPrefix)
	var builder strings.Builder
	builder.Grow(length)
	builder.WriteString(normalizedPrefix)
	for i := 0; i < remain; i++ {
		max := big.NewInt(int64(len(inviteAlphabet)))
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		index := int(n.Int64())
		builder.WriteByte(inviteAlphabet[index])
	}
	return builder.String(), nil
}

func newSessionToken() (string, error) {
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	return "s1_" + base64.RawURLEncoding.EncodeToString(randomBytes), nil
}

func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum[:])
}

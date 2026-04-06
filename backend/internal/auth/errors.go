package auth

import "errors"

var (
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidInput       = errors.New("invalid input")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserExists         = errors.New("user already exists")
	ErrInviteRequired     = errors.New("invite code is required")
	ErrInviteInvalid      = errors.New("invalid invite code")
	ErrInviteExhausted    = errors.New("invite code exhausted")
)

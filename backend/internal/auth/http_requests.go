package auth

import "time"

type credentialsRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	InviteCode string `json:"inviteCode"`
}

type loginRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	RememberFor string `json:"rememberFor"`
}

type passwordChangeRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

type inviteCreateRequest struct {
	Code      string     `json:"code"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type inviteBatchRequest struct {
	Count     int        `json:"count"`
	Length    int        `json:"length"`
	Prefix    string     `json:"prefix"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type inviteUpdateRequest struct {
	Note      *string    `json:"note"`
	MaxUses   *int       `json:"maxUses"`
	Enabled   *bool      `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type updateUserRequest struct {
	Username *string `json:"username"`
	Password *string `json:"password"`
	Role     *string `json:"role"`
}

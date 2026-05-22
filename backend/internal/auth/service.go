package auth

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AccessSettings struct {
	MembershipEnabled   bool `json:"membershipEnabled"`
	RegistrationEnabled bool `json:"registrationEnabled"`
	InviteRequired      bool `json:"inviteRequired"`
}

type InviteCodeInput struct {
	Code      string     `json:"code"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type InviteCodeUpdateInput struct {
	Note      *string    `json:"note"`
	MaxUses   *int       `json:"maxUses"`
	Enabled   *bool      `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type InviteCodeBatchInput struct {
	Count     int        `json:"count"`
	Length    int        `json:"length"`
	Prefix    string     `json:"prefix"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type AdminUserCreateInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     Role   `json:"role"`
}

type AdminUserUpdateInput struct {
	Username *string `json:"username"`
	Password *string `json:"password"`
	Role     *Role   `json:"role"`
}

type Service interface {
	Register(ctx context.Context, username, password, inviteCode string) (SafeUser, string, error)
	Login(ctx context.Context, username, password string, tokenTTL time.Duration, rememberFor string) (SafeUser, string, error)
	RevokeToken(ctx context.Context, token string) error
	GetAccessSettings(ctx context.Context) (AccessSettings, error)
	ListUsers(ctx context.Context) ([]AdminUser, error)
	CreateUser(ctx context.Context, input AdminUserCreateInput) (SafeUser, error)
	UpdateUser(ctx context.Context, userID int64, input AdminUserUpdateInput) (SafeUser, error)
	ListInviteCodes(ctx context.Context) ([]UserInviteCode, error)
	CreateInviteCode(ctx context.Context, input InviteCodeInput, creatorID *int64) (UserInviteCode, error)
	UpdateInviteCode(ctx context.Context, inviteID int64, input InviteCodeUpdateInput) (UserInviteCode, error)
	DeleteInviteCode(ctx context.Context, inviteID int64) error
	BatchCreateInviteCodes(ctx context.Context, input InviteCodeBatchInput, creatorID *int64) ([]UserInviteCode, error)
	AuthenticateToken(ctx context.Context, token string) (Viewer, error)
	GetUser(ctx context.Context, userID int64) (SafeUser, error)
	ChangePassword(ctx context.Context, userID int64, oldPassword, newPassword string) error
	ListFavorites(ctx context.Context, userID int64) ([]string, error)
	AddFavorite(ctx context.Context, userID int64, infoHash string) error
	RemoveFavorite(ctx context.Context, userID int64, infoHash string) error
}

type Params struct {
	fx.In
	Config Config
	DB     lazy.Lazy[*gorm.DB]
}

func NewService(p Params) Service {
	return &service{
		config: p.Config,
		db:     p.DB,
	}
}

type service struct {
	config Config
	db     lazy.Lazy[*gorm.DB]

	bootstrapOnce sync.Once
	bootstrapErr  error
}

func (s *service) Register(ctx context.Context, username, password, inviteCode string) (SafeUser, string, error) {
	if err := s.ensureBootstrapAdmin(ctx); err != nil {
		return SafeUser{}, "", err
	}
	access, err := s.GetAccessSettings(ctx)
	if err != nil {
		return SafeUser{}, "", err
	}
	if !access.RegistrationEnabled {
		return SafeUser{}, "", ErrForbidden
	}

	normalized, err := normalizeUsername(username)
	if err != nil {
		return SafeUser{}, "", err
	}
	if err := validatePassword(password); err != nil {
		return SafeUser{}, "", err
	}

	db, err := s.db.Get()
	if err != nil {
		return SafeUser{}, "", err
	}

	var existing User
	if err := db.WithContext(ctx).Where("username = ?", normalized).Take(&existing).Error; err == nil {
		return SafeUser{}, "", ErrUserExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return SafeUser{}, "", err
	}

	hash, err := hashPassword(password)
	if err != nil {
		return SafeUser{}, "", err
	}

	now := time.Now()
	normalizedInvite := strings.ToUpper(strings.TrimSpace(inviteCode))
	if access.InviteRequired && normalizedInvite == "" {
		return SafeUser{}, "", ErrInviteRequired
	}

	user := User{
		Username:         normalized,
		PasswordHash:     hash,
		Role:             RoleUser,
		CreatedAt:        now,
		UpdatedAt:        now,
		InviteCodeUsedAt: nil,
	}

	if normalizedInvite != "" {
		if !inviteCodeRegex.MatchString(normalizedInvite) {
			return SafeUser{}, "", ErrInviteInvalid
		}
		if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var invite UserInviteCode
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("code = ?", normalizedInvite).
				Take(&invite).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrInviteInvalid
				}
				return err
			}
			if !invite.Enabled {
				return ErrInviteInvalid
			}
			if invite.ExpiresAt != nil && invite.ExpiresAt.Before(now) {
				return ErrInviteInvalid
			}
			if invite.MaxUses > 0 && invite.UsedCount >= invite.MaxUses {
				return ErrInviteExhausted
			}
			user.InviteCodeID = &invite.ID
			user.InviteCode = invite.Code
			user.InviteCodeUsedAt = &now

			if err := tx.Create(&user).Error; err != nil {
				if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
					return ErrUserExists
				}
				return err
			}
			return tx.Model(&UserInviteCode{}).
				Where("id = ?", invite.ID).
				UpdateColumn("used_count", gorm.Expr("used_count + 1")).
				Error
		}); err != nil {
			return SafeUser{}, "", err
		}
	} else {
		if err := db.WithContext(ctx).Create(&user).Error; err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				return SafeUser{}, "", ErrUserExists
			}
			return SafeUser{}, "", err
		}
	}

	token, err := s.issueSessionToken(ctx, db, user, s.config.TokenTTL, "")
	if err != nil {
		return SafeUser{}, "", err
	}

	return toSafeUser(user), token, nil
}

func (s *service) Login(ctx context.Context, username, password string, tokenTTL time.Duration, rememberFor string) (SafeUser, string, error) {
	if err := s.ensureBootstrapAdmin(ctx); err != nil {
		return SafeUser{}, "", err
	}

	normalized, err := normalizeUsername(username)
	if err != nil {
		return SafeUser{}, "", ErrInvalidCredentials
	}

	db, err := s.db.Get()
	if err != nil {
		return SafeUser{}, "", err
	}

	var user User
	if err := db.WithContext(ctx).Where("username = ?", normalized).Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return SafeUser{}, "", ErrInvalidCredentials
		}
		return SafeUser{}, "", err
	}

	if !verifyPassword(user.PasswordHash, password) {
		return SafeUser{}, "", ErrInvalidCredentials
	}

	if tokenTTL <= 0 {
		tokenTTL = s.config.TokenTTL
	}

	token, err := s.issueSessionToken(ctx, db, user, tokenTTL, rememberFor)
	if err != nil {
		return SafeUser{}, "", err
	}

	return toSafeUser(user), token, nil
}

func (s *service) GetAccessSettings(ctx context.Context) (AccessSettings, error) {
	db, err := s.db.Get()
	if err != nil {
		return AccessSettings{}, err
	}
	values, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AuthKeys())
	if err != nil {
		return AccessSettings{}, err
	}
	result := AccessSettings{
		MembershipEnabled:   false,
		RegistrationEnabled: s.config.AllowRegistration,
		InviteRequired:      false,
	}
	if raw, ok := values[runtimeconfig.KeyAuthMembershipEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			result.MembershipEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthRegistrationEnabled]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			result.RegistrationEnabled = parsed
		}
	}
	if raw, ok := values[runtimeconfig.KeyAuthInviteRequired]; ok {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(raw)); parseErr == nil {
			result.InviteRequired = parsed
		}
	}
	return result, nil
}

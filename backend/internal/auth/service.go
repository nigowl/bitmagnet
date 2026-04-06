package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/fx"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9._-]{3,32}$`)
var inviteCodeRegex = regexp.MustCompile(`^[A-Z0-9_-]{4,64}$`)

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

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

func (s *service) ListUsers(ctx context.Context) ([]AdminUser, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}

	type adminUserRow struct {
		ID               int64
		Username         string
		Role             Role
		CreatedAt        time.Time
		InviteCodeID     *int64
		InviteCode       string
		InviteCodeUsedAt *time.Time
		InviteNote       string
	}

	var rows []adminUserRow
	usersTable := tableNameUser()
	invitesTable := tableNameUserInviteCode()
	if err := db.WithContext(ctx).
		Table(usersTable + " AS u").
		Select([]string{
			"u.id AS id",
			"u.username AS username",
			"u.role AS role",
			"u.created_at AS created_at",
			"u.invite_code_id AS invite_code_id",
			"u.invite_code AS invite_code",
			"u.invite_code_used_at AS invite_code_used_at",
			"COALESCE(ic.note, '') AS invite_note",
		}).
		Joins("LEFT JOIN " + invitesTable + " AS ic ON ic.id = u.invite_code_id").
		Order("u.created_at DESC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	users := make([]AdminUser, 0, len(rows))
	for _, row := range rows {
		users = append(users, AdminUser{
			ID:             row.ID,
			Username:       row.Username,
			Role:           row.Role,
			CreatedAt:      row.CreatedAt,
			InviteCodeID:   row.InviteCodeID,
			InviteCode:     strings.TrimSpace(row.InviteCode),
			InviteCodeUsed: row.InviteCodeUsedAt,
			InviteNote:     strings.TrimSpace(row.InviteNote),
		})
	}
	return users, nil
}

func (s *service) CreateUser(ctx context.Context, input AdminUserCreateInput) (SafeUser, error) {
	normalizedUsername, err := normalizeUsername(input.Username)
	if err != nil {
		return SafeUser{}, err
	}
	if err := validatePassword(input.Password); err != nil {
		return SafeUser{}, err
	}
	normalizedRole, err := normalizeRole(input.Role)
	if err != nil {
		return SafeUser{}, err
	}

	db, err := s.db.Get()
	if err != nil {
		return SafeUser{}, err
	}

	var existing User
	if err := db.WithContext(ctx).Where("username = ?", normalizedUsername).Take(&existing).Error; err == nil {
		return SafeUser{}, ErrUserExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return SafeUser{}, err
	}

	hash, err := hashPassword(input.Password)
	if err != nil {
		return SafeUser{}, err
	}

	now := time.Now()
	user := User{
		Username:     normalizedUsername,
		PasswordHash: hash,
		Role:         normalizedRole,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := db.WithContext(ctx).Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return SafeUser{}, ErrUserExists
		}
		return SafeUser{}, err
	}
	return toSafeUser(user), nil
}

func (s *service) UpdateUser(ctx context.Context, userID int64, input AdminUserUpdateInput) (SafeUser, error) {
	if userID <= 0 {
		return SafeUser{}, ErrInvalidInput
	}

	db, err := s.db.Get()
	if err != nil {
		return SafeUser{}, err
	}

	var user User
	if err := db.WithContext(ctx).Where("id = ?", userID).Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return SafeUser{}, ErrInvalidInput
		}
		return SafeUser{}, err
	}

	updates := map[string]any{
		"updated_at": time.Now(),
	}
	if input.Username != nil {
		normalizedUsername, normalizeErr := normalizeUsername(*input.Username)
		if normalizeErr != nil {
			return SafeUser{}, normalizeErr
		}
		updates["username"] = normalizedUsername
	}
	if input.Password != nil {
		if err := validatePassword(*input.Password); err != nil {
			return SafeUser{}, err
		}
		hash, hashErr := hashPassword(*input.Password)
		if hashErr != nil {
			return SafeUser{}, hashErr
		}
		updates["password_hash"] = hash
	}
	if input.Role != nil {
		nextRole, roleErr := normalizeRole(*input.Role)
		if roleErr != nil {
			return SafeUser{}, roleErr
		}
		if user.Role == RoleAdmin && nextRole != RoleAdmin {
			var adminCount int64
			if err := db.WithContext(ctx).Model(&User{}).Where("role = ?", RoleAdmin).Count(&adminCount).Error; err != nil {
				return SafeUser{}, err
			}
			if adminCount <= 1 {
				return SafeUser{}, ErrForbidden
			}
		}
		updates["role"] = nextRole
	}

	if len(updates) == 1 {
		return toSafeUser(user), nil
	}

	if err := db.WithContext(ctx).Model(&User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return SafeUser{}, ErrUserExists
		}
		return SafeUser{}, err
	}
	if err := db.WithContext(ctx).Where("id = ?", userID).Take(&user).Error; err != nil {
		return SafeUser{}, err
	}
	return toSafeUser(user), nil
}

func (s *service) ListInviteCodes(ctx context.Context) ([]UserInviteCode, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}
	var items []UserInviteCode
	if err := db.WithContext(ctx).
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (s *service) CreateInviteCode(ctx context.Context, input InviteCodeInput, creatorID *int64) (UserInviteCode, error) {
	db, err := s.db.Get()
	if err != nil {
		return UserInviteCode{}, err
	}

	now := time.Now()
	code := strings.ToUpper(strings.TrimSpace(input.Code))
	if code == "" {
		code, err = generateInviteCode(10, "")
		if err != nil {
			return UserInviteCode{}, err
		}
	}
	if !inviteCodeRegex.MatchString(code) {
		return UserInviteCode{}, ErrInvalidInput
	}
	maxUses := input.MaxUses
	if maxUses < 0 {
		return UserInviteCode{}, ErrInvalidInput
	}

	item := UserInviteCode{
		Code:      code,
		Note:      strings.TrimSpace(input.Note),
		MaxUses:   maxUses,
		UsedCount: 0,
		Enabled:   input.Enabled,
		ExpiresAt: input.ExpiresAt,
		CreatedBy: creatorID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := db.WithContext(ctx).Create(&item).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return UserInviteCode{}, ErrInvalidInput
		}
		return UserInviteCode{}, err
	}
	return item, nil
}

func (s *service) UpdateInviteCode(ctx context.Context, inviteID int64, input InviteCodeUpdateInput) (UserInviteCode, error) {
	if inviteID <= 0 {
		return UserInviteCode{}, ErrInvalidInput
	}
	db, err := s.db.Get()
	if err != nil {
		return UserInviteCode{}, err
	}
	var item UserInviteCode
	if err := db.WithContext(ctx).Where("id = ?", inviteID).Take(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return UserInviteCode{}, ErrInvalidInput
		}
		return UserInviteCode{}, err
	}

	updates := map[string]any{
		"updated_at": time.Now(),
	}
	if input.Note != nil {
		updates["note"] = strings.TrimSpace(*input.Note)
	}
	if input.MaxUses != nil {
		if *input.MaxUses < 0 {
			return UserInviteCode{}, ErrInvalidInput
		}
		if *input.MaxUses > 0 && *input.MaxUses < item.UsedCount {
			return UserInviteCode{}, ErrInvalidInput
		}
		updates["max_uses"] = *input.MaxUses
	}
	if input.Enabled != nil {
		updates["enabled"] = *input.Enabled
	}
	if input.ExpiresAt != nil {
		updates["expires_at"] = input.ExpiresAt
	}
	if err := db.WithContext(ctx).Model(&UserInviteCode{}).Where("id = ?", inviteID).Updates(updates).Error; err != nil {
		return UserInviteCode{}, err
	}
	if err := db.WithContext(ctx).Where("id = ?", inviteID).Take(&item).Error; err != nil {
		return UserInviteCode{}, err
	}
	return item, nil
}

func (s *service) DeleteInviteCode(ctx context.Context, inviteID int64) error {
	if inviteID <= 0 {
		return ErrInvalidInput
	}
	db, err := s.db.Get()
	if err != nil {
		return err
	}
	return db.WithContext(ctx).Where("id = ?", inviteID).Delete(&UserInviteCode{}).Error
}

func (s *service) BatchCreateInviteCodes(
	ctx context.Context,
	input InviteCodeBatchInput,
	creatorID *int64,
) ([]UserInviteCode, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}
	count := input.Count
	if count < 1 || count > 200 {
		return nil, ErrInvalidInput
	}
	length := input.Length
	if length < 6 || length > 32 {
		return nil, ErrInvalidInput
	}
	prefix := strings.ToUpper(strings.TrimSpace(input.Prefix))
	if prefix != "" {
		if !inviteCodeRegex.MatchString(prefix) {
			return nil, ErrInvalidInput
		}
		if len(prefix)+4 > length {
			return nil, ErrInvalidInput
		}
	}
	if input.MaxUses < 0 {
		return nil, ErrInvalidInput
	}

	created := make([]UserInviteCode, 0, count)
	now := time.Now()
	for i := 0; i < count; i++ {
		var item UserInviteCode
		const maxAttempts = 24
		createdOK := false
		for attempt := 0; attempt < maxAttempts; attempt++ {
			code, codeErr := generateInviteCode(length, prefix)
			if codeErr != nil {
				return nil, codeErr
			}
			item = UserInviteCode{
				Code:      code,
				Note:      strings.TrimSpace(input.Note),
				MaxUses:   input.MaxUses,
				UsedCount: 0,
				Enabled:   input.Enabled,
				ExpiresAt: input.ExpiresAt,
				CreatedBy: creatorID,
				CreatedAt: now,
				UpdatedAt: now,
			}
			createErr := db.WithContext(ctx).Create(&item).Error
			if createErr == nil {
				createdOK = true
				break
			}
			if !strings.Contains(strings.ToLower(createErr.Error()), "duplicate") {
				return nil, createErr
			}
		}
		if !createdOK {
			return nil, ErrInvalidInput
		}
		created = append(created, item)
	}
	return created, nil
}

func (s *service) AuthenticateToken(ctx context.Context, token string) (Viewer, error) {
	if err := s.ensureBootstrapAdmin(ctx); err != nil {
		return Viewer{}, err
	}

	if viewer, ok, err := s.authenticateSessionToken(ctx, token); err != nil {
		return Viewer{}, err
	} else if ok {
		return viewer, nil
	}

	db, err := s.db.Get()
	if err != nil {
		return Viewer{}, err
	}

	payloadViewer, err := parseToken(s.config.TokenSecret, token)
	if err != nil {
		return Viewer{}, ErrUnauthorized
	}

	var user User
	if err := db.WithContext(ctx).
		Select("id", "username", "role").
		Where("id = ?", payloadViewer.ID).
		Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Viewer{}, ErrUnauthorized
		}
		return Viewer{}, err
	}

	if user.Username != payloadViewer.Username || user.Role != payloadViewer.Role {
		return Viewer{}, ErrUnauthorized
	}

	return Viewer{ID: user.ID, Username: user.Username, Role: user.Role}, nil
}

func (s *service) RevokeToken(ctx context.Context, token string) error {
	normalized := strings.TrimSpace(token)
	if normalized == "" {
		return nil
	}
	db, err := s.db.Get()
	if err != nil {
		return err
	}
	hash := hashSessionToken(normalized)
	now := time.Now()
	return db.WithContext(ctx).
		Model(&UserSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", hash).
		Updates(map[string]any{
			"revoked_at":   now,
			"last_seen_at": now,
		}).Error
}

func (s *service) GetUser(ctx context.Context, userID int64) (SafeUser, error) {
	db, err := s.db.Get()
	if err != nil {
		return SafeUser{}, err
	}

	var user User
	if err := db.WithContext(ctx).Where("id = ?", userID).Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return SafeUser{}, ErrUnauthorized
		}
		return SafeUser{}, err
	}

	return toSafeUser(user), nil
}

func (s *service) ChangePassword(ctx context.Context, userID int64, oldPassword, newPassword string) error {
	if oldPassword == "" || newPassword == "" {
		return ErrInvalidInput
	}
	if err := validatePassword(newPassword); err != nil {
		return err
	}

	db, err := s.db.Get()
	if err != nil {
		return err
	}

	var user User
	if err := db.WithContext(ctx).Where("id = ?", userID).Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUnauthorized
		}
		return err
	}

	if !verifyPassword(user.PasswordHash, oldPassword) {
		return ErrInvalidCredentials
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := db.WithContext(ctx).
		Model(&User{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"password_hash": hash,
			"updated_at":    time.Now(),
		}).Error; err != nil {
		return err
	}
	now := time.Now()
	return db.WithContext(ctx).
		Model(&UserSession{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Updates(map[string]any{
			"revoked_at":   now,
			"last_seen_at": now,
		}).Error
}

func (s *service) issueSessionToken(
	ctx context.Context,
	db *gorm.DB,
	user User,
	ttl time.Duration,
	rememberFor string,
) (string, error) {
	if ttl <= 0 {
		ttl = s.config.TokenTTL
	}
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}

	token, err := newSessionToken()
	if err != nil {
		return "", err
	}

	now := time.Now()
	expiresAt := now.Add(ttl)
	rememberValue := strings.TrimSpace(rememberFor)
	if rememberValue == "" {
		rememberValue = ttl.String()
	}

	session := UserSession{
		UserID:      user.ID,
		TokenHash:   hashSessionToken(token),
		RememberFor: rememberValue,
		ExpiresAt:   expiresAt,
		CreatedAt:   now,
		LastSeenAt:  now,
	}
	if err := db.WithContext(ctx).Create(&session).Error; err != nil {
		return "", err
	}
	return token, nil
}

func (s *service) authenticateSessionToken(ctx context.Context, token string) (Viewer, bool, error) {
	normalized := strings.TrimSpace(token)
	if normalized == "" {
		return Viewer{}, false, nil
	}

	db, err := s.db.Get()
	if err != nil {
		return Viewer{}, false, err
	}

	now := time.Now()
	var session UserSession
	if err := db.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", hashSessionToken(normalized), now).
		Take(&session).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Viewer{}, false, nil
		}
		return Viewer{}, false, err
	}

	if session.LastSeenAt.Before(now.Add(-5 * time.Minute)) {
		_ = db.WithContext(ctx).
			Model(&UserSession{}).
			Where("id = ?", session.ID).
			Update("last_seen_at", now).
			Error
	}

	var user User
	if err := db.WithContext(ctx).
		Select("id", "username", "role").
		Where("id = ?", session.UserID).
		Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Viewer{}, false, ErrUnauthorized
		}
		return Viewer{}, false, err
	}

	return Viewer{ID: user.ID, Username: user.Username, Role: user.Role}, true, nil
}

func (s *service) ListFavorites(ctx context.Context, userID int64) ([]string, error) {
	db, err := s.db.Get()
	if err != nil {
		return nil, err
	}

	var favorites []UserFavorite
	if err := db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&favorites).Error; err != nil {
		return nil, err
	}

	items := make([]string, 0, len(favorites))
	for _, favorite := range favorites {
		id, err := protocol.NewIDFromByteSlice(favorite.InfoHash)
		if err != nil {
			continue
		}
		items = append(items, id.String())
	}
	return items, nil
}

func (s *service) AddFavorite(ctx context.Context, userID int64, infoHash string) error {
	hash, err := protocol.ParseID(strings.TrimSpace(infoHash))
	if err != nil {
		return fmt.Errorf("%w: info hash", ErrInvalidInput)
	}

	db, err := s.db.Get()
	if err != nil {
		return err
	}

	now := time.Now()
	favorite := UserFavorite{
		UserID:    userID,
		InfoHash:  hash[:],
		CreatedAt: now,
	}

	return db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&favorite).Error
}

func (s *service) RemoveFavorite(ctx context.Context, userID int64, infoHash string) error {
	hash, err := protocol.ParseID(strings.TrimSpace(infoHash))
	if err != nil {
		return fmt.Errorf("%w: info hash", ErrInvalidInput)
	}

	db, err := s.db.Get()
	if err != nil {
		return err
	}

	return db.WithContext(ctx).
		Where("user_id = ? AND info_hash = ?", userID, hash[:]).
		Delete(&UserFavorite{}).Error
}

func (s *service) ensureBootstrapAdmin(ctx context.Context) error {
	s.bootstrapOnce.Do(func() {
		s.bootstrapErr = s.bootstrapAdmin(ctx)
	})
	return s.bootstrapErr
}

func (s *service) bootstrapAdmin(ctx context.Context) error {
	username, err := normalizeUsername(s.config.BootstrapAdminUsername)
	if err != nil {
		return nil
	}
	if err := validatePassword(s.config.BootstrapAdminPassword); err != nil {
		return nil
	}

	db, err := s.db.Get()
	if err != nil {
		return err
	}

	var existing User
	if err := db.WithContext(ctx).Where("username = ?", username).Take(&existing).Error; err == nil {
		updates := map[string]any{}
		if existing.Role != RoleAdmin {
			updates["role"] = RoleAdmin
		}
		if !verifyPassword(existing.PasswordHash, s.config.BootstrapAdminPassword) {
			hash, hashErr := hashPassword(s.config.BootstrapAdminPassword)
			if hashErr != nil {
				return hashErr
			}
			updates["password_hash"] = hash
		}
		if len(updates) > 0 {
			updates["updated_at"] = time.Now()
			return db.WithContext(ctx).
				Model(&User{}).
				Where("id = ?", existing.ID).
				Updates(updates).Error
		}
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := hashPassword(s.config.BootstrapAdminPassword)
	if err != nil {
		return err
	}

	now := time.Now()
	admin := User{
		Username:     username,
		PasswordHash: hash,
		Role:         RoleAdmin,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := db.WithContext(ctx).Create(&admin).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return nil
		}
		return err
	}

	return nil
}

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

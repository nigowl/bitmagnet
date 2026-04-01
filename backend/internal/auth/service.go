package auth

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bitmagnet-io/bitmagnet/internal/lazy"
	"github.com/bitmagnet-io/bitmagnet/internal/protocol"
	"go.uber.org/fx"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9._-]{3,32}$`)

type Service interface {
	Register(ctx context.Context, username, password string) (SafeUser, string, error)
	Login(ctx context.Context, username, password string) (SafeUser, string, error)
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

func (s *service) Register(ctx context.Context, username, password string) (SafeUser, string, error) {
	if !s.config.AllowRegistration {
		return SafeUser{}, "", ErrForbidden
	}
	if err := s.ensureBootstrapAdmin(ctx); err != nil {
		return SafeUser{}, "", err
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
	user := User{
		Username:     normalized,
		PasswordHash: hash,
		Role:         RoleUser,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := db.WithContext(ctx).Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return SafeUser{}, "", ErrUserExists
		}
		return SafeUser{}, "", err
	}

	viewer := Viewer{ID: user.ID, Username: user.Username, Role: user.Role}
	token, err := buildToken(s.config.TokenSecret, viewer, s.config.TokenTTL)
	if err != nil {
		return SafeUser{}, "", err
	}

	return toSafeUser(user), token, nil
}

func (s *service) Login(ctx context.Context, username, password string) (SafeUser, string, error) {
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

	viewer := Viewer{ID: user.ID, Username: user.Username, Role: user.Role}
	token, err := buildToken(s.config.TokenSecret, viewer, s.config.TokenTTL)
	if err != nil {
		return SafeUser{}, "", err
	}

	return toSafeUser(user), token, nil
}

func (s *service) AuthenticateToken(ctx context.Context, token string) (Viewer, error) {
	if err := s.ensureBootstrapAdmin(ctx); err != nil {
		return Viewer{}, err
	}

	payloadViewer, err := parseToken(s.config.TokenSecret, token)
	if err != nil {
		return Viewer{}, ErrUnauthorized
	}

	db, err := s.db.Get()
	if err != nil {
		return Viewer{}, err
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

	return db.WithContext(ctx).
		Model(&User{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"password_hash": hash,
			"updated_at":    time.Now(),
		}).Error
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

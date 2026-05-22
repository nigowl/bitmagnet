package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

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

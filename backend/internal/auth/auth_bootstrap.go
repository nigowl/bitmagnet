package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

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

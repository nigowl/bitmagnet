package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

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

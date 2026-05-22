package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

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

package auth

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type Viewer struct {
	ID       int64
	Username string
	Role     Role
}

type User struct {
	ID               int64      `gorm:"column:id;primaryKey;autoIncrement"`
	Username         string     `gorm:"column:username;uniqueIndex;not null"`
	PasswordHash     string     `gorm:"column:password_hash;not null"`
	Role             Role       `gorm:"column:role;not null"`
	InviteCodeID     *int64     `gorm:"column:invite_code_id"`
	InviteCode       string     `gorm:"column:invite_code"`
	InviteCodeUsedAt *time.Time `gorm:"column:invite_code_used_at"`
	CreatedAt        time.Time  `gorm:"column:created_at;not null"`
	UpdatedAt        time.Time  `gorm:"column:updated_at;not null"`
}

type UserFavorite struct {
	UserID    int64     `gorm:"column:user_id;primaryKey"`
	InfoHash  []byte    `gorm:"column:info_hash;primaryKey"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`
}

type SafeUser struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserInviteCode struct {
	ID        int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Code      string     `gorm:"column:code;uniqueIndex;not null" json:"code"`
	Note      string     `gorm:"column:note;not null" json:"note"`
	MaxUses   int        `gorm:"column:max_uses;not null" json:"maxUses"`
	UsedCount int        `gorm:"column:used_count;not null" json:"usedCount"`
	Enabled   bool       `gorm:"column:enabled;not null" json:"enabled"`
	ExpiresAt *time.Time `gorm:"column:expires_at" json:"expiresAt,omitempty"`
	CreatedBy *int64     `gorm:"column:created_by" json:"createdBy,omitempty"`
	CreatedAt time.Time  `gorm:"column:created_at;not null" json:"createdAt"`
	UpdatedAt time.Time  `gorm:"column:updated_at;not null" json:"updatedAt"`
}

type UserSession struct {
	ID          int64      `gorm:"column:id;primaryKey;autoIncrement"`
	UserID      int64      `gorm:"column:user_id;not null;index"`
	TokenHash   string     `gorm:"column:token_hash;not null;uniqueIndex"`
	RememberFor string     `gorm:"column:remember_for;not null"`
	ExpiresAt   time.Time  `gorm:"column:expires_at;not null;index"`
	CreatedAt   time.Time  `gorm:"column:created_at;not null"`
	LastSeenAt  time.Time  `gorm:"column:last_seen_at;not null"`
	RevokedAt   *time.Time `gorm:"column:revoked_at;index"`
}

type AdminUser struct {
	ID             int64      `json:"id"`
	Username       string     `json:"username"`
	Role           Role       `json:"role"`
	CreatedAt      time.Time  `json:"createdAt"`
	InviteCodeID   *int64     `json:"inviteCodeId,omitempty"`
	InviteCode     string     `json:"inviteCode,omitempty"`
	InviteCodeUsed *time.Time `json:"inviteCodeUsedAt,omitempty"`
	InviteNote     string     `json:"inviteNote,omitempty"`
}

func (User) TableName() string {
	return tableNameUser()
}

func (UserFavorite) TableName() string {
	return tableNameUserFavorite()
}

func (UserInviteCode) TableName() string {
	return tableNameUserInviteCode()
}

func (UserSession) TableName() string {
	return tableNameUserSession()
}

func toSafeUser(u User) SafeUser {
	return SafeUser{
		ID:        u.ID,
		Username:  u.Username,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}

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
	ID           int64     `gorm:"column:id;primaryKey;autoIncrement"`
	Username     string    `gorm:"column:username;uniqueIndex;not null"`
	PasswordHash string    `gorm:"column:password_hash;not null"`
	Role         Role      `gorm:"column:role;not null"`
	CreatedAt    time.Time `gorm:"column:created_at;not null"`
	UpdatedAt    time.Time `gorm:"column:updated_at;not null"`
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

func (User) TableName() string {
	return tableNameUser()
}

func (UserFavorite) TableName() string {
	return tableNameUserFavorite()
}

func toSafeUser(u User) SafeUser {
	return SafeUser{
		ID:        u.ID,
		Username:  u.Username,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}

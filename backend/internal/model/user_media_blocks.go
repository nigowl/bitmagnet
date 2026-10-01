package model

import "time"

var TableNameUserMediaBlock = "user_media_blocks"

type UserMediaBlock struct {
	UserID    int64     `gorm:"column:user_id;primaryKey"`
	MediaID   string    `gorm:"column:media_id;primaryKey"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`
}

func (UserMediaBlock) TableName() string {
	return TableNameUserMediaBlock
}

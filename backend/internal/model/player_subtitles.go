package model

import "time"

type PlayerSubtitle struct {
	ID            int64     `gorm:"column:id;primaryKey;autoIncrement"`
	InfoHash      string    `gorm:"column:info_hash;not null;index"`
	Label         string    `gorm:"column:label;not null"`
	Language      string    `gorm:"column:language;not null"`
	OffsetSeconds float64   `gorm:"column:offset_seconds;not null;default:0"`
	ContentVTT    string    `gorm:"column:content_vtt;not null"`
	CreatedAt     time.Time `gorm:"column:created_at;not null"`
	UpdatedAt     time.Time `gorm:"column:updated_at;not null"`
}

func (PlayerSubtitle) TableName() string {
	return TableNamePlayerSubtitle
}

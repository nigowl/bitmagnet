package model

import (
	"database/sql"
	"time"
)

// BloomFilter mapped from table <bloom_filters>.
type BloomFilter struct {
	Key       string        `gorm:"column:key;primaryKey" json:"key"`
	Oid       sql.NullInt32 `gorm:"column:oid" json:"oid"`
	CreatedAt time.Time     `gorm:"column:created_at;not null;<-:create" json:"createdAt"`
	UpdatedAt time.Time     `gorm:"column:updated_at;not null" json:"updatedAt"`
}

// TableName BloomFilter's table name.
func (*BloomFilter) TableName() string {
	return TableNameBloomFilter
}

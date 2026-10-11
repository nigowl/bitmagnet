package model

import "time"

var TableNameMediaTopic = "media_topics"
var TableNameMediaTopicItem = "media_topic_items"

type MediaTopic struct {
	ID          string    `gorm:"column:id;primaryKey" json:"id"`
	Kind        string    `gorm:"column:kind;not null" json:"kind"`
	Module      string    `gorm:"column:module;not null" json:"module"`
	Name        string    `gorm:"column:name;not null" json:"name"`
	Description string    `gorm:"column:description;not null" json:"description"`
	SortOrder   int       `gorm:"column:sort_order;not null" json:"sortOrder"`
	ItemCount   int       `gorm:"column:item_count;not null" json:"itemCount"`
	Enabled     bool      `gorm:"column:enabled;not null" json:"enabled"`
	CreatedAt   time.Time `gorm:"column:created_at;not null" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"column:updated_at;not null" json:"updatedAt"`
}

func (MediaTopic) TableName() string {
	return TableNameMediaTopic
}

type MediaTopicItem struct {
	TopicID   string    `gorm:"column:topic_id;primaryKey" json:"topicId"`
	MediaID   string    `gorm:"column:media_id;primaryKey" json:"mediaId"`
	Position  int       `gorm:"column:position;not null" json:"position"`
	CreatedAt time.Time `gorm:"column:created_at;not null" json:"createdAt"`
}

func (MediaTopicItem) TableName() string {
	return TableNameMediaTopicItem
}

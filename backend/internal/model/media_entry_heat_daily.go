package model

import "time"

var TableNameMediaEntryHeatDaily = "media_entry_heat_daily"

// MediaEntryHeatDaily stores one media item's heat points aggregated by day.
type MediaEntryHeatDaily struct {
	MediaID      string    `gorm:"column:media_id;primaryKey;<-:create" json:"mediaId"`
	HeatDate     Date      `gorm:"column:heat_date;primaryKey;<-:create" json:"heatDate"`
	HeatScore    int64     `gorm:"column:heat_score;not null" json:"heatScore"`
	TorrentCount int       `gorm:"column:torrent_count;not null" json:"torrentCount"`
	CreatedAt    time.Time `gorm:"column:created_at;not null;<-:create" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"column:updated_at;not null" json:"updatedAt"`
}

func (*MediaEntryHeatDaily) TableName() string {
	return TableNameMediaEntryHeatDaily
}

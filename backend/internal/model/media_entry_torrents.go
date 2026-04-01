package model

import (
	"time"

	"github.com/nigowl/bitmagnet/internal/protocol"
)

var TableNameMediaEntryTorrent = "media_entry_torrents"

// MediaEntryTorrent maps one media entity to multiple torrent info hashes.
type MediaEntryTorrent struct {
	MediaID   string      `gorm:"column:media_id;primaryKey;<-:create" json:"mediaId"`
	InfoHash  protocol.ID `gorm:"column:info_hash;primaryKey;<-:create" json:"infoHash"`
	CreatedAt time.Time   `gorm:"column:created_at;not null;<-:create" json:"createdAt"`
}

func (*MediaEntryTorrent) TableName() string {
	return TableNameMediaEntryTorrent
}

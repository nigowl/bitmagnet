package model

import "strings"

var TableNameBloomFilter = "bloom_filters"
var TableNameUser = "users"
var TableNameUserFavorite = "user_favorites"

var defaultTableNames = map[*string]string{
	&TableNameContent:                  "content",
	&TableNameContentAttribute:         "content_attributes",
	&TableNameContentCollection:        "content_collections",
	&TableNameContentCollectionContent: "content_collections_content",
	&TableNameKeyValue:                 "key_values",
	&TableNameMetadataSource:           "metadata_sources",
	&TableNameMediaEntry:               "media_entries",
	&TableNameMediaEntryTorrent:        "media_entry_torrents",
	&TableNameQueueJob:                 "queue_jobs",
	&TableNameTorrent:                  "torrents",
	&TableNameTorrentContent:           "torrent_contents",
	&TableNameTorrentFile:              "torrent_files",
	&TableNameTorrentHint:              "torrent_hints",
	&TableNameTorrentPieces:            "torrent_pieces",
	&TableNameTorrentSource:            "torrent_sources",
	&TableNameTorrentTag:               "torrent_tags",
	&TableNameTorrentsTorrentSource:    "torrents_torrent_sources",
	&TableNameBloomFilter:              "bloom_filters",
	&TableNameUser:                     "users",
	&TableNameUserFavorite:             "user_favorites",
}

func ApplyTablePrefix(prefix string) {
	prefix = strings.TrimSpace(prefix)

	for tableNamePtr, baseName := range defaultTableNames {
		*tableNamePtr = prefix + baseName
	}
}

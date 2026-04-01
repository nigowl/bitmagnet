package migrations

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"gorm.io/gorm"
)

var validTablePrefixRegex = regexp.MustCompile(`^[A-Za-z0-9_]*$`)

var prefixedTables = []string{
	"torrent_sources",
	"torrents",
	"torrents_torrent_sources",
	"torrent_files",
	"metadata_sources",
	"content",
	"content_attributes",
	"content_collections",
	"content_collections_content",
	"media_entries",
	"media_entry_torrents",
	"torrent_contents",
	"torrent_hints",
	"torrent_tags",
	"key_values",
	"queue_jobs",
	"torrent_pieces",
	"bloom_filters",
	"users",
	"user_favorites",
}

func EnsureTablePrefix(ctx context.Context, db *gorm.DB, prefix string) error {
	prefix = strings.TrimSpace(prefix)
	if !validTablePrefixRegex.MatchString(prefix) {
		return fmt.Errorf("invalid table prefix %q: only letters, numbers and underscore are allowed", prefix)
	}

	for _, baseName := range prefixedTables {
		targetName := prefix + baseName
		if targetName == baseName {
			continue
		}

		targetExists, err := tableExists(ctx, db, targetName)
		if err != nil {
			return err
		}
		if targetExists {
			continue
		}

		sourceExists, err := tableExists(ctx, db, baseName)
		if err != nil {
			return err
		}
		if !sourceExists {
			continue
		}

		sql := fmt.Sprintf("ALTER TABLE \"%s\" RENAME TO \"%s\"", baseName, targetName)
		if err := db.WithContext(ctx).Exec(sql).Error; err != nil {
			return fmt.Errorf("failed to rename table %q to %q: %w", baseName, targetName, err)
		}
	}

	return nil
}

func tableExists(ctx context.Context, db *gorm.DB, tableName string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).
		Raw("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?", tableName).
		Scan(&count).Error; err != nil {
		return false, fmt.Errorf("failed checking table existence for %q: %w", tableName, err)
	}
	return count > 0, nil
}

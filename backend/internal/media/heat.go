package media

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

const (
	defaultHomeHotDays = 30
	maxHomeHotDays     = 3650
)

const mediaHeatScoreExpressionSQL = `GREATEST(
	1::bigint,
	ROUND(
		(LN(1 + GREATEST(COALESCE(tc.seeders, 0), 0)) * 100.0) +
		(LN(1 + GREATEST(COALESCE(tc.leechers, 0), 0)) * 35.0) +
		25.0
	)::bigint
)`

func clampHomeHotDays(days int) int {
	switch {
	case days < 1:
		return defaultHomeHotDays
	case days > maxHomeHotDays:
		return maxHomeHotDays
	default:
		return days
	}
}

func loadHomeHotDays(ctx context.Context, db *gorm.DB) int {
	if db == nil {
		return defaultHomeHotDays
	}

	values, err := runtimeconfig.ReadValues(ctx, db, []string{runtimeconfig.KeyHomeHotDays})
	if err != nil {
		return defaultHomeHotDays
	}

	raw, ok := values[runtimeconfig.KeyHomeHotDays]
	if !ok {
		return defaultHomeHotDays
	}

	parsed, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return defaultHomeHotDays
	}

	return clampHomeHotDays(parsed)
}

func applyPopularHeatDaysScope(db *gorm.DB, days int) *gorm.DB {
	days = clampHomeHotDays(days)
	intervalDays := days - 1
	joinSQL := fmt.Sprintf(
		`LEFT JOIN (
			SELECT
				media_id,
				SUM(heat_score)::bigint AS popular_heat_score
			FROM %s
			WHERE heat_date >= CURRENT_DATE - (CAST(? AS integer) * INTERVAL '1 day')
			GROUP BY media_id
		) popular_heat ON popular_heat.media_id = me.id`,
		model.TableNameMediaEntryHeatDaily,
	)

	return db.Joins(joinSQL, intervalDays)
}

func RefreshRecentHeatWindow(ctx context.Context, db *gorm.DB, days int) error {
	if db == nil {
		return nil
	}

	days = clampHomeHotDays(days)
	intervalDays := days - 1
	updateSQL := fmt.Sprintf(
		`UPDATE %s me
			SET heat_score_total = COALESCE(src.total_heat, 0),
				heat_score_recent = COALESCE(src.recent_heat, 0)
		FROM (
			SELECT
				me_inner.id AS media_id,
				COALESCE(SUM(hd.heat_score), 0)::bigint AS total_heat,
				COALESCE(
					SUM(hd.heat_score) FILTER (
						WHERE hd.heat_date >= CURRENT_DATE - (CAST(? AS integer) * INTERVAL '1 day')
					),
					0
				)::bigint AS recent_heat
			FROM %s me_inner
			LEFT JOIN %s hd ON hd.media_id = me_inner.id
			GROUP BY me_inner.id
		) src
		WHERE me.id = src.media_id`,
		model.TableNameMediaEntry,
		model.TableNameMediaEntry,
		model.TableNameMediaEntryHeatDaily,
	)

	return db.WithContext(ctx).Exec(updateSQL, intervalDays).Error
}

func refreshMediaHeat(ctx context.Context, db *gorm.DB, mediaIDs []string, days int) error {
	if db == nil || len(mediaIDs) == 0 {
		return nil
	}

	days = clampHomeHotDays(days)
	intervalDays := days - 1

	deleteSQL := fmt.Sprintf(`DELETE FROM %s WHERE media_id IN ?`, model.TableNameMediaEntryHeatDaily)
	if err := db.WithContext(ctx).Exec(deleteSQL, mediaIDs).Error; err != nil {
		return err
	}

	insertSQL := fmt.Sprintf(
		`INSERT INTO %s (media_id, heat_date, heat_score, torrent_count, created_at, updated_at)
		SELECT
			me.id,
			COALESCE(NULLIF(tc.published_at::date, DATE '1999-01-01'), tc.created_at::date) AS heat_date,
			SUM(%s)::bigint AS heat_score,
			COUNT(DISTINCT tc.info_hash)::integer AS torrent_count,
			now(),
			now()
		FROM %s tc
		JOIN %s me
			ON me.content_type = tc.content_type
			AND me.content_source = tc.content_source
			AND me.content_id = tc.content_id
		WHERE me.id IN ?
			AND tc.content_type IN (?, ?)
			AND tc.content_source IS NOT NULL
			AND tc.content_id IS NOT NULL
		GROUP BY me.id, COALESCE(NULLIF(tc.published_at::date, DATE '1999-01-01'), tc.created_at::date)
		ON CONFLICT (media_id, heat_date) DO UPDATE SET
			heat_score = EXCLUDED.heat_score,
			torrent_count = EXCLUDED.torrent_count,
			updated_at = now()`,
		model.TableNameMediaEntryHeatDaily,
		mediaHeatScoreExpressionSQL,
		model.TableNameTorrentContent,
		model.TableNameMediaEntry,
	)
	if err := db.WithContext(ctx).Exec(
		insertSQL,
		mediaIDs,
		model.ContentTypeMovie,
		model.ContentTypeTvShow,
	).Error; err != nil {
		return err
	}

	updateSQL := fmt.Sprintf(
		`UPDATE %s me
			SET heat_score_total = COALESCE(src.total_heat, 0),
				heat_score_recent = COALESCE(src.recent_heat, 0)
		FROM (
			SELECT
				hd.media_id,
				SUM(hd.heat_score)::bigint AS total_heat,
				COALESCE(
					SUM(hd.heat_score) FILTER (
						WHERE hd.heat_date >= CURRENT_DATE - (CAST(? AS integer) * INTERVAL '1 day')
					),
					0
				)::bigint AS recent_heat
			FROM %s hd
			WHERE hd.media_id IN ?
			GROUP BY hd.media_id
		) src
		WHERE me.id = src.media_id
			AND me.id IN ?`,
		model.TableNameMediaEntry,
		model.TableNameMediaEntryHeatDaily,
	)
	if err := db.WithContext(ctx).Exec(updateSQL, intervalDays, mediaIDs, mediaIDs).Error; err != nil {
		return err
	}

	resetSQL := fmt.Sprintf(
		`UPDATE %s me
			SET heat_score_total = 0,
				heat_score_recent = 0
		WHERE me.id IN ?
			AND NOT EXISTS (
				SELECT 1
				FROM %s hd
				WHERE hd.media_id = me.id
			)`,
		model.TableNameMediaEntry,
		model.TableNameMediaEntryHeatDaily,
	)

	return db.WithContext(ctx).Exec(resetSQL, mediaIDs).Error
}

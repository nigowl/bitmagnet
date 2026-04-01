package media

import (
	"context"
	"fmt"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

// SyncEntries rebuilds media records and bindings for the provided content refs.
func SyncEntries(ctx context.Context, db *gorm.DB, refs []model.ContentRef) error {
	filteredRefs := filterSupportedRefs(refs)
	if len(filteredRefs) == 0 {
		return nil
	}

	mediaIDs := make([]string, 0, len(filteredRefs))
	for _, ref := range filteredRefs {
		mediaIDs = append(mediaIDs, model.MediaEntryID(ref.Type, ref.Source, ref.ID))
	}

	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntryTorrent).
		Where("media_id IN ?", mediaIDs).
		Delete(&model.MediaEntryTorrent{}).Error; err != nil {
		return err
	}

	contentRefWhere, args := buildContentRefWhereClause("c.type", "c.source", "c.id", filteredRefs)

	upsertMediaSQL := fmt.Sprintf(
		`INSERT INTO %s (
			id,
			content_type,
			content_source,
			content_id,
			title,
			release_date,
			release_year,
			original_language,
			name_original,
			overview_original,
			runtime,
			popularity,
			vote_count,
			poster_path,
			backdrop_path,
			vote_average,
			collections,
			attributes,
			genres,
			languages,
			quality_tags,
			is_anime,
			torrent_count,
			max_seeders,
			latest_published_at,
			created_at,
			updated_at
		)
		SELECT
			md5(c.type || ':' || c.source || ':' || c.id),
			c.type,
			c.source,
			c.id,
			c.title,
			c.release_date,
			c.release_year,
			c.original_language,
			coalesce(nullif(c.original_title, ''), c.title),
			nullif(c.overview, ''),
			c.runtime,
			c.popularity,
			c.vote_count,
			attrs.poster_path,
			attrs.backdrop_path,
			c.vote_average,
			coalesce(cols.collections, '[]'::jsonb),
			coalesce(attrs.attributes, '[]'::jsonb),
			coalesce(cols.genres, '[]'::jsonb),
			coalesce(tc_meta.languages, '[]'::jsonb),
			coalesce(tc_meta.quality_tags, '[]'::jsonb),
			coalesce(cols.is_anime, false) AS is_anime,
			coalesce(tc_meta.torrent_count, 0),
			tc_meta.max_seeders,
			tc_meta.latest_published_at,
			now(),
			now()
		FROM %s c
		LEFT JOIN LATERAL (
			SELECT
				max(CASE WHEN ca.source = 'tmdb' AND ca.key = 'poster_path' THEN ca.value END) AS poster_path,
				max(CASE WHEN ca.source = 'tmdb' AND ca.key = 'backdrop_path' THEN ca.value END) AS backdrop_path,
				coalesce(
					jsonb_agg(
						DISTINCT jsonb_build_object('source', ca.source, 'key', ca.key, 'value', ca.value)
					) FILTER (WHERE ca.key IS NOT NULL),
					'[]'::jsonb
				) AS attributes
			FROM %s ca
			WHERE ca.content_type = c.type
				AND ca.content_source = c.source
				AND ca.content_id = c.id
		) attrs ON true
		LEFT JOIN LATERAL (
			SELECT
				coalesce(
					jsonb_agg(
						DISTINCT jsonb_build_object('type', cc.type, 'name', cc.name)
					) FILTER (WHERE cc.id IS NOT NULL),
					'[]'::jsonb
				) AS collections,
				coalesce(
					jsonb_agg(DISTINCT cc.name) FILTER (WHERE cc.type = 'genre' AND cc.name IS NOT NULL),
					'[]'::jsonb
				) AS genres,
				coalesce(bool_or(cc.type = 'genre' AND lower(cc.name) IN ('animation', 'anime', '动漫', '动画')), false) AS is_anime
			FROM %s ccc
			JOIN %s cc
				ON cc.type = ccc.content_collection_type
				AND cc.source = ccc.content_collection_source
				AND cc.id = ccc.content_collection_id
			WHERE ccc.content_type = c.type
				AND ccc.content_source = c.source
				AND ccc.content_id = c.id
		) cols ON true
		JOIN LATERAL (
			SELECT
				count(DISTINCT tc.info_hash)::integer AS torrent_count,
				max(tc.seeders)::integer AS max_seeders,
				max(tc.published_at) AS latest_published_at,
				coalesce(
					(
						SELECT jsonb_agg(lang)
						FROM (
							SELECT DISTINCT jsonb_array_elements_text(coalesce(tc2.languages, '[]'::jsonb)) AS lang
							FROM %s tc2
							WHERE tc2.content_type = c.type
								AND tc2.content_source = c.source
								AND tc2.content_id = c.id
						) langs
					),
					'[]'::jsonb
				) AS languages,
				coalesce(
					(
						SELECT jsonb_agg(tag)
						FROM (
							SELECT DISTINCT quality.tag
							FROM (
								SELECT tc3.video_resolution::text AS tag
								FROM %s tc3
								WHERE tc3.content_type = c.type
									AND tc3.content_source = c.source
									AND tc3.content_id = c.id
									AND tc3.video_resolution IS NOT NULL
								UNION
								SELECT tc3.video_source::text AS tag
								FROM %s tc3
								WHERE tc3.content_type = c.type
									AND tc3.content_source = c.source
									AND tc3.content_id = c.id
									AND tc3.video_source IS NOT NULL
								UNION
								SELECT tc3.video_3d::text AS tag
								FROM %s tc3
								WHERE tc3.content_type = c.type
									AND tc3.content_source = c.source
									AND tc3.content_id = c.id
									AND tc3.video_3d IS NOT NULL
								UNION
								SELECT tc3.video_modifier::text AS tag
								FROM %s tc3
								WHERE tc3.content_type = c.type
									AND tc3.content_source = c.source
									AND tc3.content_id = c.id
									AND tc3.video_modifier IS NOT NULL
							) quality
							WHERE quality.tag IS NOT NULL AND quality.tag <> ''
						) tags
					),
					'[]'::jsonb
				) AS quality_tags
			FROM %s tc
			WHERE tc.content_type = c.type
				AND tc.content_source = c.source
				AND tc.content_id = c.id
		) tc_meta ON tc_meta.torrent_count > 0
		WHERE %s
			AND c.type IN (?, ?)
			AND c.source IS NOT NULL
			AND c.id IS NOT NULL
		ON CONFLICT (content_type, content_source, content_id) DO UPDATE SET
			title = EXCLUDED.title,
			release_date = EXCLUDED.release_date,
			release_year = EXCLUDED.release_year,
			original_language = EXCLUDED.original_language,
			name_original = EXCLUDED.name_original,
			overview_original = EXCLUDED.overview_original,
			runtime = EXCLUDED.runtime,
			popularity = EXCLUDED.popularity,
			vote_count = EXCLUDED.vote_count,
			poster_path = EXCLUDED.poster_path,
			backdrop_path = EXCLUDED.backdrop_path,
			vote_average = EXCLUDED.vote_average,
			collections = EXCLUDED.collections,
			attributes = EXCLUDED.attributes,
			genres = EXCLUDED.genres,
			languages = EXCLUDED.languages,
			quality_tags = EXCLUDED.quality_tags,
			is_anime = EXCLUDED.is_anime,
			torrent_count = EXCLUDED.torrent_count,
			max_seeders = EXCLUDED.max_seeders,
			latest_published_at = EXCLUDED.latest_published_at,
			updated_at = now()`,
		model.TableNameMediaEntry,
		model.TableNameContent,
		model.TableNameContentAttribute,
		model.TableNameContentCollectionContent,
		model.TableNameContentCollection,
		model.TableNameTorrentContent,
		model.TableNameTorrentContent,
		model.TableNameTorrentContent,
		model.TableNameTorrentContent,
		model.TableNameTorrentContent,
		model.TableNameTorrentContent,
		contentRefWhere,
	)
	upsertArgs := append([]any{}, args...)
	upsertArgs = append(upsertArgs, model.ContentTypeMovie, model.ContentTypeTvShow)
	if err := db.WithContext(ctx).Exec(upsertMediaSQL, upsertArgs...).Error; err != nil {
		return err
	}

	mappingWhereClause, mappingArgs := buildContentRefWhereClause("tc.content_type", "tc.content_source", "tc.content_id", filteredRefs)

	insertMappingsSQL := fmt.Sprintf(
		`INSERT INTO %s (media_id, info_hash, created_at)
		SELECT
			me.id,
			tc.info_hash,
			now()
		FROM %s tc
		JOIN %s me
			ON me.content_type = tc.content_type
			AND me.content_source = tc.content_source
			AND me.content_id = tc.content_id
		WHERE %s
			AND tc.content_type IN (?, ?)
			AND tc.content_source IS NOT NULL
			AND tc.content_id IS NOT NULL
		ON CONFLICT (media_id, info_hash) DO NOTHING`,
		model.TableNameMediaEntryTorrent,
		model.TableNameTorrentContent,
		model.TableNameMediaEntry,
		mappingWhereClause,
	)
	insertArgs := append([]any{}, mappingArgs...)
	insertArgs = append(insertArgs, model.ContentTypeMovie, model.ContentTypeTvShow)
	if err := db.WithContext(ctx).Exec(insertMappingsSQL, insertArgs...).Error; err != nil {
		return err
	}

	deleteStaleSQL := fmt.Sprintf(
		`DELETE FROM %s me
		WHERE me.id IN ?
			AND NOT EXISTS (
				SELECT 1 FROM %s met WHERE met.media_id = me.id
			)`,
		model.TableNameMediaEntry,
		model.TableNameMediaEntryTorrent,
	)
	if err := db.WithContext(ctx).Exec(deleteStaleSQL, mediaIDs).Error; err != nil {
		return err
	}

	if err := enrichStructuredMetadata(ctx, db, mediaIDs); err != nil {
		return err
	}

	return nil
}

func buildContentRefWhereClause(
	contentTypeColumn string,
	contentSourceColumn string,
	contentIDColumn string,
	refs []model.ContentRef,
) (string, []any) {
	placeholders := make([]string, 0, len(refs))
	args := make([]any, 0, len(refs)*3)
	for _, ref := range refs {
		placeholders = append(placeholders, "(?, ?, ?)")
		args = append(args, ref.Type, ref.Source, ref.ID)
	}

	return fmt.Sprintf(
		"(%s, %s, %s) IN (%s)",
		contentTypeColumn,
		contentSourceColumn,
		contentIDColumn,
		strings.Join(placeholders, ","),
	), args
}

func filterSupportedRefs(refs []model.ContentRef) []model.ContentRef {
	result := make([]model.ContentRef, 0, len(refs))
	seen := make(map[model.ContentRef]struct{}, len(refs))

	for _, ref := range refs {
		if ref.Type != model.ContentTypeMovie && ref.Type != model.ContentTypeTvShow {
			continue
		}
		if ref.Source == "" || ref.ID == "" {
			continue
		}
		if _, ok := seen[ref]; ok {
			continue
		}
		seen[ref] = struct{}{}
		result = append(result, ref)
	}

	return result
}

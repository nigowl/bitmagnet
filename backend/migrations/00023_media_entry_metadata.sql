-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  me_table text;
  tc_table text;
  c_table text;
  ca_table text;
  ccc_table text;
  cc_table text;
BEGIN
  SELECT table_name INTO me_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  ORDER BY (table_name = 'media_entries') DESC, length(table_name)
  LIMIT 1;

  IF me_table IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS release_date date', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS original_language text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS original_title text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS overview text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS runtime integer', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS popularity float', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS vote_count integer', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS collections jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS genres jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS quality_tags jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (genres)', me_table || '_genres_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (languages)', me_table || '_languages_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (quality_tags)', me_table || '_quality_tags_idx', me_table);

  SELECT table_name INTO tc_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'torrent_contents' OR table_name ~ '^[A-Za-z0-9_]+_torrent_contents$')
  ORDER BY (table_name = 'torrent_contents') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO c_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'content' OR table_name ~ '^[A-Za-z0-9_]+_content$')
  ORDER BY (table_name = 'content') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO ca_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'content_attributes' OR table_name ~ '^[A-Za-z0-9_]+_content_attributes$')
  ORDER BY (table_name = 'content_attributes') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO ccc_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'content_collections_content' OR table_name ~ '^[A-Za-z0-9_]+_content_collections_content$')
  ORDER BY (table_name = 'content_collections_content') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO cc_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'content_collections' OR table_name ~ '^[A-Za-z0-9_]+_content_collections$')
  ORDER BY (table_name = 'content_collections') DESC, length(table_name)
  LIMIT 1;

  IF tc_table IS NULL OR c_table IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format($sql$
    UPDATE %1$I me
    SET
      title = c.title,
      release_date = c.release_date,
      release_year = c.release_year,
      original_language = c.original_language,
      original_title = c.original_title,
      overview = c.overview,
      runtime = c.runtime,
      popularity = c.popularity,
      vote_average = c.vote_average,
      vote_count = c.vote_count,
      poster_path = coalesce(attrs.poster_path, me.poster_path),
      backdrop_path = coalesce(attrs.backdrop_path, me.backdrop_path),
      collections = coalesce(cols.collections, '[]'::jsonb),
      attributes = coalesce(attrs.attributes, '[]'::jsonb),
      genres = coalesce(cols.genres, '[]'::jsonb),
      languages = coalesce(tc_meta.languages, '[]'::jsonb),
      quality_tags = coalesce(tc_meta.quality_tags, '[]'::jsonb),
      is_anime = coalesce(cols.is_anime, false),
      torrent_count = coalesce(tc_meta.torrent_count, 0),
      max_seeders = tc_meta.max_seeders,
      latest_published_at = tc_meta.latest_published_at,
      updated_at = now()
    FROM %2$I c
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
      FROM %3$I ca
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
      FROM %4$I ccc
      JOIN %5$I cc
        ON cc.type = ccc.content_collection_type
        AND cc.source = ccc.content_collection_source
        AND cc.id = ccc.content_collection_id
      WHERE ccc.content_type = c.type
        AND ccc.content_source = c.source
        AND ccc.content_id = c.id
    ) cols ON true
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT tc.info_hash)::integer AS torrent_count,
        max(tc.seeders)::integer AS max_seeders,
        max(tc.published_at) AS latest_published_at,
        coalesce(
          (
            SELECT jsonb_agg(lang)
            FROM (
              SELECT DISTINCT jsonb_array_elements_text(coalesce(tc2.languages, '[]'::jsonb)) AS lang
              FROM %6$I tc2
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
                FROM %6$I tc3
                WHERE tc3.content_type = c.type
                  AND tc3.content_source = c.source
                  AND tc3.content_id = c.id
                  AND tc3.video_resolution IS NOT NULL
                UNION
                SELECT tc3.video_source::text AS tag
                FROM %6$I tc3
                WHERE tc3.content_type = c.type
                  AND tc3.content_source = c.source
                  AND tc3.content_id = c.id
                  AND tc3.video_source IS NOT NULL
                UNION
                SELECT tc3.video_3d::text AS tag
                FROM %6$I tc3
                WHERE tc3.content_type = c.type
                  AND tc3.content_source = c.source
                  AND tc3.content_id = c.id
                  AND tc3.video_3d IS NOT NULL
                UNION
                SELECT tc3.video_modifier::text AS tag
                FROM %6$I tc3
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
      FROM %6$I tc
      WHERE tc.content_type = c.type
        AND tc.content_source = c.source
        AND tc.content_id = c.id
    ) tc_meta ON true
    WHERE me.content_type = c.type
      AND me.content_source = c.source
      AND me.content_id = c.id
  $sql$, me_table, c_table, ca_table, ccc_table, cc_table, tc_table);
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  me_table text;
BEGIN
  SELECT table_name INTO me_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  ORDER BY (table_name = 'media_entries') DESC, length(table_name)
  LIMIT 1;

  IF me_table IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_genres_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_languages_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_quality_tags_idx');
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS quality_tags', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS languages', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS genres', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS attributes', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS collections', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS vote_count', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS popularity', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS runtime', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS overview', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS original_title', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS original_language', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS release_date', me_table);
END $$;

-- +goose StatementEnd

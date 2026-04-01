-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  me_table text;
  c_table text;
  ca_table text;
  ccc_table text;
  cc_table text;
  ms_table text;
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

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name_original text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name_en text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name_zh text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS imdb_id text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS douban_id text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS production_countries jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS spoken_languages jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS premiere_dates jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS episode_count integer', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cast_members jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS director_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS writer_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (imdb_id)', me_table || '_imdb_id_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (douban_id)', me_table || '_douban_id_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (production_countries)', me_table || '_production_countries_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (spoken_languages)', me_table || '_spoken_languages_idx', me_table);

  SELECT table_name INTO ms_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'metadata_sources' OR table_name ~ '^[A-Za-z0-9_]+_metadata_sources$')
  ORDER BY (table_name = 'metadata_sources') DESC, length(table_name)
  LIMIT 1;

  IF ms_table IS NOT NULL THEN
    EXECUTE format(
      'INSERT INTO %I (key, name, created_at, updated_at)
       VALUES (''douban'', ''Douban'', now(), now())
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, updated_at = now()',
      ms_table
    );
  END IF;

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

  IF c_table IS NULL OR ca_table IS NULL OR ccc_table IS NULL OR cc_table IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format($sql$
    UPDATE %1$I me
    SET
      name_original = coalesce(nullif(c.original_title, ''), c.title),
      name_en = coalesce(
        me.name_en,
        attrs.name_en,
        CASE WHEN c.title ~ '^[[:ascii:][:space:][:punct:]]+$' THEN c.title END,
        CASE WHEN c.original_title ~ '^[[:ascii:][:space:][:punct:]]+$' THEN c.original_title END
      ),
      name_zh = coalesce(
        me.name_zh,
        attrs.name_zh,
        CASE WHEN c.title ~ '[一-龥]' THEN c.title END,
        CASE WHEN c.original_title ~ '[一-龥]' THEN c.original_title END
      ),
      imdb_id = coalesce(
        me.imdb_id,
        attrs.imdb_id
      ),
      douban_id = coalesce(
        me.douban_id,
        attrs.douban_id
      ),
      production_countries = coalesce(
        cols.production_countries,
        '[]'::jsonb
      ),
      episode_count = coalesce(
        me.episode_count,
        attrs.episode_count
      ),
      premiere_dates = CASE
        WHEN c.release_date IS NULL THEN me.premiere_dates
        ELSE to_jsonb(ARRAY[to_char(c.release_date, 'YYYY-MM-DD')])
      END,
      updated_at = now()
    FROM %2$I c
    LEFT JOIN LATERAL (
      SELECT
        max(CASE
              WHEN ca.source = 'tmdb'
               AND lower(ca.key) IN ('title_en', 'english_title', 'en_title', 'sub_title')
              THEN nullif(trim(ca.value), '')
            END) AS name_en,
        max(CASE
              WHEN (ca.source = 'tmdb' AND lower(ca.key) IN ('title_zh', 'chinese_title', 'zh_title'))
                OR (ca.source = 'douban' AND lower(ca.key) IN ('title', 'name'))
              THEN nullif(trim(ca.value), '')
            END) AS name_zh,
        max(CASE WHEN ca.source = 'imdb' AND lower(ca.key) = 'id' THEN nullif(trim(ca.value), '') END) AS imdb_id,
        max(
          CASE
            WHEN ca.source = 'douban' AND lower(ca.key) IN ('id', 'douban_id', 'subject_id', 'subjectid')
            THEN nullif(regexp_replace(ca.value, '[^0-9]', '', 'g'), '')
          END
        ) AS douban_id,
        max(
          CASE
            WHEN lower(ca.key) IN ('number_of_episodes', 'episode_count')
              AND ca.value ~ '^[0-9]+$'
            THEN ca.value::integer
          END
        ) AS episode_count
      FROM %3$I ca
      WHERE ca.content_type = c.type
        AND ca.content_source = c.source
        AND ca.content_id = c.id
    ) attrs ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(jsonb_agg(country_name), '[]'::jsonb) AS production_countries
      FROM (
        SELECT DISTINCT cc.name AS country_name
        FROM %4$I ccc
        JOIN %5$I cc
          ON cc.type = ccc.content_collection_type
         AND cc.source = ccc.content_collection_source
         AND cc.id = ccc.content_collection_id
        WHERE ccc.content_type = c.type
          AND ccc.content_source = c.source
          AND ccc.content_id = c.id
          AND cc.type IN ('country', 'region')
          AND cc.name <> ''
      ) countries
    ) cols ON true
    WHERE me.content_type = c.type
      AND me.content_source = c.source
      AND me.content_id = c.id
  $sql$, me_table, c_table, ca_table, ccc_table, cc_table);
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

  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_spoken_languages_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_production_countries_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_douban_id_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_imdb_id_idx');

  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS writer_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS director_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS cast_members', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS episode_count', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS premiere_dates', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS spoken_languages', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS production_countries', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS douban_id', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS imdb_id', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS name_zh', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS name_en', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS name_original', me_table);
END $$;

-- +goose StatementEnd

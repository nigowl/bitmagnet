-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  me_table text;
  tc_table text;
  heat_table text;
BEGIN
  SELECT table_name INTO me_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  ORDER BY (table_name = 'media_entries') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO tc_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'torrent_contents' OR table_name ~ '^[A-Za-z0-9_]+_torrent_contents$')
  ORDER BY (table_name = 'torrent_contents') DESC, length(table_name)
  LIMIT 1;

  IF me_table IS NULL OR tc_table IS NULL THEN
    RAISE EXCEPTION 'required tables not found while creating media heat tables';
  END IF;

  heat_table := regexp_replace(me_table, 'media_entries$', 'media_entry_heat_daily');

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS heat_score_total bigint NOT NULL DEFAULT 0', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS heat_score_recent bigint NOT NULL DEFAULT 0', me_table);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      media_id text not null,
      heat_date date not null,
      heat_score bigint not null default 0,
      torrent_count integer not null default 0,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      primary key (media_id, heat_date),
      foreign key (media_id) references %I(id) on delete cascade
    )',
    heat_table,
    me_table
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (media_id, heat_date DESC)', heat_table || '_media_date_idx', heat_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (heat_date DESC, heat_score DESC)', heat_table || '_date_score_idx', heat_table);

  EXECUTE format('DELETE FROM %I', heat_table);

  EXECUTE format(
    'INSERT INTO %I (media_id, heat_date, heat_score, torrent_count, created_at, updated_at)
     SELECT
       me.id,
       COALESCE(NULLIF(tc.published_at::date, DATE ''1999-01-01''), tc.created_at::date) AS heat_date,
       SUM(
         GREATEST(
           1::bigint,
           ROUND(
             (LN(1 + GREATEST(COALESCE(tc.seeders, 0), 0)) * 100.0) +
             (LN(1 + GREATEST(COALESCE(tc.leechers, 0), 0)) * 35.0) +
             25.0
           )::bigint
         )
       )::bigint AS heat_score,
       COUNT(DISTINCT tc.info_hash)::integer AS torrent_count,
       now(),
       now()
     FROM %I tc
     JOIN %I me
       ON me.content_type = tc.content_type
      AND me.content_source = tc.content_source
      AND me.content_id = tc.content_id
     WHERE tc.content_type IN (''movie'', ''tv_show'')
       AND tc.content_source IS NOT NULL
       AND tc.content_id IS NOT NULL
     GROUP BY me.id, COALESCE(NULLIF(tc.published_at::date, DATE ''1999-01-01''), tc.created_at::date)
     ON CONFLICT (media_id, heat_date) DO UPDATE SET
       heat_score = EXCLUDED.heat_score,
       torrent_count = EXCLUDED.torrent_count,
       updated_at = now()',
    heat_table,
    tc_table,
    me_table
  );

  EXECUTE format(
    'UPDATE %1$I me
        SET heat_score_total = COALESCE(src.total_heat, 0),
            heat_score_recent = COALESCE(src.recent_heat, 0)
       FROM (
         SELECT
           hd.media_id,
           SUM(hd.heat_score)::bigint AS total_heat,
           COALESCE(SUM(hd.heat_score) FILTER (WHERE hd.heat_date >= CURRENT_DATE - INTERVAL ''29 days''), 0)::bigint AS recent_heat
         FROM %2$I hd
         GROUP BY hd.media_id
       ) src
      WHERE me.id = src.media_id',
    me_table,
    heat_table
  );

  EXECUTE format(
    'UPDATE %1$I me
        SET heat_score_total = 0,
            heat_score_recent = 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM %2$I hd
        WHERE hd.media_id = me.id
      )',
    me_table,
    heat_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  me_table text;
  heat_table text;
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

  heat_table := regexp_replace(me_table, 'media_entries$', 'media_entry_heat_daily');

  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', heat_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS heat_score_recent', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS heat_score_total', me_table);
END $$;

-- +goose StatementEnd

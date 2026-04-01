-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  content_table text;
  torrents_table text;
BEGIN
  SELECT table_name INTO content_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'content' OR table_name ~ '^[A-Za-z0-9_]+_content$')
  ORDER BY (table_name = 'content') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO torrents_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'torrents' OR table_name ~ '^[A-Za-z0-9_]+_torrents$')
  ORDER BY (table_name = 'torrents') DESC, length(table_name)
  LIMIT 1;

  IF content_table IS NULL OR torrents_table IS NULL THEN
    RAISE EXCEPTION 'required tables not found while creating media tables';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS media_entries (
      id text primary key,
      content_type text not null,
      content_source text not null,
      content_id text not null,
      title text not null,
      release_year integer,
      poster_path text,
      backdrop_path text,
      vote_average float,
      is_anime boolean not null default false,
      torrent_count integer not null default 0,
      max_seeders integer,
      latest_published_at timestamp with time zone,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      unique (content_type, content_source, content_id),
      foreign key (content_type, content_source, content_id) references %I(type, source, id) on delete cascade
    )',
    content_table
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS media_entry_torrents (
      media_id text not null,
      info_hash bytea not null,
      created_at timestamp with time zone not null default now(),
      primary key (media_id, info_hash),
      foreign key (media_id) references media_entries(id) on delete cascade,
      foreign key (info_hash) references %I(info_hash) on delete cascade
    )',
    torrents_table
  );
END $$;

CREATE INDEX IF NOT EXISTS media_entries_content_type_idx ON media_entries (content_type);
CREATE INDEX IF NOT EXISTS media_entries_is_anime_idx ON media_entries (is_anime);
CREATE INDEX IF NOT EXISTS media_entries_release_year_idx ON media_entries (release_year);
CREATE INDEX IF NOT EXISTS media_entries_latest_published_at_idx ON media_entries (latest_published_at);
CREATE INDEX IF NOT EXISTS media_entries_updated_at_idx ON media_entries (updated_at);
CREATE INDEX IF NOT EXISTS media_entries_content_ref_idx ON media_entries (content_source, content_id);
CREATE INDEX IF NOT EXISTS media_entries_title_trgm_idx ON media_entries USING gist (title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS media_entry_torrents_info_hash_idx ON media_entry_torrents (info_hash);

DO $$
DECLARE
  tc_table text;
  c_table text;
  ca_table text;
  ccc_table text;
  cc_table text;
BEGIN
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

  EXECUTE format(
    'INSERT INTO media_entries (
      id, content_type, content_source, content_id, title, release_year, poster_path, backdrop_path,
      vote_average, is_anime, torrent_count, max_seeders, latest_published_at, created_at, updated_at
    )
    SELECT
      md5(tc.content_type || '':'' || tc.content_source || '':'' || tc.content_id) AS id,
      tc.content_type,
      tc.content_source,
      tc.content_id,
      c.title,
      c.release_year,
      max(CASE WHEN ca.source = ''tmdb'' AND ca.key = ''poster_path'' THEN ca.value END) AS poster_path,
      max(CASE WHEN ca.source = ''tmdb'' AND ca.key = ''backdrop_path'' THEN ca.value END) AS backdrop_path,
      c.vote_average,
      coalesce(bool_or(cc.type = ''genre'' AND lower(cc.name) IN (''animation'', ''anime'', ''动漫'', ''动画'')), false) AS is_anime,
      count(DISTINCT tc.info_hash)::integer AS torrent_count,
      max(tc.seeders)::integer AS max_seeders,
      max(tc.published_at) AS latest_published_at,
      now(),
      now()
    FROM %I tc
    JOIN %I c
      ON c.type = tc.content_type
      AND c.source = tc.content_source
      AND c.id = tc.content_id
    LEFT JOIN %I ca
      ON ca.content_type = tc.content_type
      AND ca.content_source = tc.content_source
      AND ca.content_id = tc.content_id
    LEFT JOIN %I ccc
      ON ccc.content_type = tc.content_type
      AND ccc.content_source = tc.content_source
      AND ccc.content_id = tc.content_id
    LEFT JOIN %I cc
      ON cc.type = ccc.content_collection_type
      AND cc.source = ccc.content_collection_source
      AND cc.id = ccc.content_collection_id
    WHERE tc.content_type IN (''movie'', ''tv_show'')
      AND tc.content_source IS NOT NULL
      AND tc.content_id IS NOT NULL
    GROUP BY tc.content_type, tc.content_source, tc.content_id, c.title, c.release_year, c.vote_average
    ON CONFLICT (content_type, content_source, content_id) DO UPDATE SET
      title = EXCLUDED.title,
      release_year = EXCLUDED.release_year,
      poster_path = EXCLUDED.poster_path,
      backdrop_path = EXCLUDED.backdrop_path,
      vote_average = EXCLUDED.vote_average,
      is_anime = EXCLUDED.is_anime,
      torrent_count = EXCLUDED.torrent_count,
      max_seeders = EXCLUDED.max_seeders,
      latest_published_at = EXCLUDED.latest_published_at,
      updated_at = now()',
    tc_table, c_table, ca_table, ccc_table, cc_table
  );

  EXECUTE format(
    'INSERT INTO media_entry_torrents (media_id, info_hash, created_at)
    SELECT DISTINCT
      md5(tc.content_type || '':'' || tc.content_source || '':'' || tc.content_id) AS media_id,
      tc.info_hash,
      now()
    FROM %I tc
    WHERE tc.content_type IN (''movie'', ''tv_show'')
      AND tc.content_source IS NOT NULL
      AND tc.content_id IS NOT NULL
    ON CONFLICT (media_id, info_hash) DO NOTHING',
    tc_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name = 'media_entry_torrents' OR table_name ~ '^[A-Za-z0-9_]+_media_entry_torrents$')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.table_name);
  END LOOP;

  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.table_name);
  END LOOP;
END $$;

-- +goose StatementEnd


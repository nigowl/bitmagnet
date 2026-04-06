-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  torrents_table text;
  subtitles_table text;
  table_prefix text;
BEGIN
  SELECT table_name INTO torrents_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'torrents' OR table_name ~ '^[A-Za-z0-9_]+_torrents$')
  ORDER BY (table_name = 'torrents') DESC, length(table_name)
  LIMIT 1;

  IF torrents_table IS NULL THEN
    table_prefix := '';
  ELSE
    table_prefix := regexp_replace(torrents_table, 'torrents$', '');
  END IF;

  subtitles_table := table_prefix || 'player_subtitles';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id BIGSERIAL PRIMARY KEY,
      info_hash text NOT NULL,
      label text NOT NULL,
      language text NOT NULL DEFAULT ''und'',
      content_vtt text NOT NULL,
      created_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone NOT NULL
    )',
    subtitles_table
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (info_hash)', subtitles_table || '_info_hash_idx', subtitles_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (updated_at)', subtitles_table || '_updated_at_idx', subtitles_table);
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  torrents_table text;
  subtitles_table text;
  table_prefix text;
BEGIN
  SELECT table_name INTO torrents_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'torrents' OR table_name ~ '^[A-Za-z0-9_]+_torrents$')
  ORDER BY (table_name = 'torrents') DESC, length(table_name)
  LIMIT 1;

  IF torrents_table IS NULL THEN
    table_prefix := '';
  ELSE
    table_prefix := regexp_replace(torrents_table, 'torrents$', '');
  END IF;

  subtitles_table := table_prefix || 'player_subtitles';
  EXECUTE format('DROP TABLE IF EXISTS %I', subtitles_table);
END $$;

-- +goose StatementEnd

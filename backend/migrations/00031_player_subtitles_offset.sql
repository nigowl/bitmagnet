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
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS offset_seconds double precision NOT NULL DEFAULT 0',
    subtitles_table
  );
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
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS offset_seconds', subtitles_table);
END $$;

-- +goose StatementEnd

-- +goose Up
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

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS has_cache boolean NOT NULL DEFAULT false', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cache_updated_at timestamp with time zone', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (has_cache, cache_updated_at DESC)', me_table || '_has_cache_idx', me_table);
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

  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_has_cache_idx');
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS cache_updated_at', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS has_cache', me_table);
END $$;

-- +goose StatementEnd

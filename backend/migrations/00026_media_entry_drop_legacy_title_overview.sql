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

  EXECUTE format(
    'UPDATE %I
     SET
       name_original = coalesce(nullif(name_original, ''''), nullif(original_title, ''''), nullif(title, '''')),
       overview_original = coalesce(nullif(overview_original, ''''), nullif(overview, '''')),
       updated_at = now()',
    me_table
  );

  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS original_title', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS overview', me_table);
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

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS original_title text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS overview text', me_table);

  EXECUTE format(
    'UPDATE %I
     SET
       original_title = coalesce(nullif(original_title, ''''), nullif(name_original, ''''), nullif(title, '''')),
       overview = coalesce(nullif(overview, ''''), nullif(overview_original, '''')),
       updated_at = now()',
    me_table
  );
END $$;

-- +goose StatementEnd

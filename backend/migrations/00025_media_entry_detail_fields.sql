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

  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS overview_original text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS overview_en text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS overview_zh text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tagline text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status_text text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS homepage_url text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS season_count integer', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS network_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS studio_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS award_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS certification text', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS creator_names jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS title_aliases jsonb NOT NULL DEFAULT ''[]''::jsonb', me_table);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (network_names)', me_table || '_network_names_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (studio_names)', me_table || '_studio_names_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (award_names)', me_table || '_award_names_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (creator_names)', me_table || '_creator_names_idx', me_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gin (title_aliases)', me_table || '_title_aliases_idx', me_table);

  EXECUTE format(
    'UPDATE %I
     SET
       overview_original = coalesce(nullif(overview_original, ''''), nullif(overview, '''')),
       updated_at = now()',
    me_table
  );
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

  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_title_aliases_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_creator_names_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_award_names_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_studio_names_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', me_table || '_network_names_idx');

  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS title_aliases', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS creator_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS certification', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS award_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS studio_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS network_names', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS season_count', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS homepage_url', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS status_text', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS tagline', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS overview_zh', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS overview_en', me_table);
  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS overview_original', me_table);
END $$;

-- +goose StatementEnd

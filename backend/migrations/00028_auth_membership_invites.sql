-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  users_table text;
  invite_table text;
  table_prefix text;
  fk_name text;
BEGIN
  SELECT table_name INTO users_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'users' OR table_name ~ '^[A-Za-z0-9_]+_users$')
  ORDER BY (table_name = 'users') DESC, length(table_name)
  LIMIT 1;

  IF users_table IS NULL THEN
    table_prefix := '';
  ELSE
    table_prefix := regexp_replace(users_table, 'users$', '');
  END IF;

  invite_table := table_prefix || 'user_invite_codes';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id BIGSERIAL PRIMARY KEY,
      code text NOT NULL UNIQUE,
      note text NOT NULL DEFAULT '''',
      max_uses integer NOT NULL DEFAULT 1,
      used_count integer NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true,
      expires_at timestamp with time zone,
      created_by bigint,
      created_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone NOT NULL,
      CHECK (max_uses >= 0),
      CHECK (used_count >= 0)
    )',
    invite_table
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (enabled, expires_at)', invite_table || '_enabled_expires_idx', invite_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at DESC)', invite_table || '_created_at_idx', invite_table);

  IF users_table IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS invite_code_id BIGINT', users_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS invite_code text', users_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS invite_code_used_at timestamp with time zone', users_table);

    fk_name := users_table || '_invite_code_id_fkey';
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = users_table
        AND constraint_name = fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (invite_code_id) REFERENCES %I(id) ON DELETE SET NULL',
        users_table,
        fk_name,
        invite_table
      );
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (invite_code_id)', users_table || '_invite_code_id_idx', users_table);
  END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  users_table text;
  invite_table text;
  table_prefix text;
BEGIN
  SELECT table_name INTO users_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'users' OR table_name ~ '^[A-Za-z0-9_]+_users$')
  ORDER BY (table_name = 'users') DESC, length(table_name)
  LIMIT 1;

  IF users_table IS NULL THEN
    table_prefix := '';
  ELSE
    table_prefix := regexp_replace(users_table, 'users$', '');
  END IF;

  invite_table := table_prefix || 'user_invite_codes';

  IF users_table IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', users_table, users_table || '_invite_code_id_fkey');
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS invite_code_used_at', users_table);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS invite_code', users_table);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS invite_code_id', users_table);
  END IF;

  EXECUTE format('DROP TABLE IF EXISTS %I', invite_table);
END $$;

-- +goose StatementEnd

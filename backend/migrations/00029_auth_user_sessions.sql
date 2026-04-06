-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  users_table text;
  sessions_table text;
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

  sessions_table := table_prefix || 'user_sessions';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token_hash text NOT NULL UNIQUE,
      remember_for text NOT NULL DEFAULT '''',
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone NOT NULL,
      last_seen_at timestamp with time zone NOT NULL,
      revoked_at timestamp with time zone
    )',
    sessions_table
  );

  IF users_table IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = sessions_table
        AND constraint_name = sessions_table || '_user_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES %I(id) ON DELETE CASCADE',
        sessions_table,
        sessions_table || '_user_id_fkey',
        users_table
      );
    END IF;
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (user_id)', sessions_table || '_user_id_idx', sessions_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expires_at)', sessions_table || '_expires_at_idx', sessions_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (revoked_at)', sessions_table || '_revoked_at_idx', sessions_table);
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  users_table text;
  sessions_table text;
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

  sessions_table := table_prefix || 'user_sessions';
  EXECUTE format('DROP TABLE IF EXISTS %I', sessions_table);
END $$;

-- +goose StatementEnd

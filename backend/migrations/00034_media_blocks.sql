-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  users_table text;
  media_table text;
BEGIN
  SELECT table_name INTO users_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'users' OR table_name ~ '^[A-Za-z0-9_]+_users$')
  ORDER BY (table_name = 'users') DESC, length(table_name)
  LIMIT 1;

  SELECT table_name INTO media_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  ORDER BY (table_name = 'media_entries') DESC, length(table_name)
  LIMIT 1;

  IF users_table IS NULL OR media_table IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS user_media_blocks (
      user_id bigint NOT NULL,
      media_id text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, media_id),
      FOREIGN KEY (user_id) REFERENCES %I(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES %I(id) ON DELETE CASCADE
    )',
    users_table, media_table
  );
  EXECUTE 'CREATE INDEX IF NOT EXISTS user_media_blocks_created_at_idx ON user_media_blocks (user_id, created_at DESC)';
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
  users_table text;
  blocks_table text;
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

  blocks_table := table_prefix || 'user_media_blocks';
  EXECUTE format('DROP TABLE IF EXISTS %I', blocks_table);
END $$;
-- +goose StatementEnd

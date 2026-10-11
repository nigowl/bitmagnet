-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  media_table text;
  table_prefix text;
  topics_table text;
  items_table text;
BEGIN
  SELECT table_name INTO media_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_entries' OR table_name ~ '^[A-Za-z0-9_]+_media_entries$')
  ORDER BY (table_name = 'media_entries') DESC, length(table_name)
  LIMIT 1;

  IF media_table IS NULL THEN
    RETURN;
  END IF;

  table_prefix := regexp_replace(media_table, 'media_entries$', '');
  topics_table := table_prefix || 'media_topics';
  items_table := table_prefix || 'media_topic_items';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id          text                     NOT NULL PRIMARY KEY,
      kind        text                     NOT NULL,
      module      text                     NOT NULL DEFAULT ''custom'',
      name        text                     NOT NULL,
      description text                     NOT NULL DEFAULT '''',
      sort_order  integer                  NOT NULL DEFAULT 0,
      item_count  integer                  NOT NULL DEFAULT 0,
      enabled     boolean                  NOT NULL DEFAULT true,
      created_at  timestamp with time zone NOT NULL DEFAULT now(),
      updated_at  timestamp with time zone NOT NULL DEFAULT now()
    )',
    topics_table
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (kind, sort_order, name)',
    topics_table || '_kind_order_idx',
    topics_table
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      topic_id   text                     NOT NULL REFERENCES %I (id) ON DELETE CASCADE,
      media_id   text                     NOT NULL REFERENCES %I (id) ON DELETE CASCADE,
      position   integer                  NOT NULL DEFAULT 0,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY (topic_id, media_id)
    )',
    items_table,
    topics_table,
    media_table
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (topic_id, position)',
    items_table || '_topic_position_idx',
    items_table
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (media_id)',
    items_table || '_media_idx',
    items_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DO $$
DECLARE
  topics_table text;
  items_table text;
BEGIN
  SELECT table_name INTO topics_table
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (table_name = 'media_topics' OR table_name ~ '^[A-Za-z0-9_]+_media_topics$')
  ORDER BY (table_name = 'media_topics') DESC, length(table_name)
  LIMIT 1;

  IF topics_table IS NULL THEN
    RETURN;
  END IF;

  items_table := regexp_replace(topics_table, 'media_topics$', '') || 'media_topic_items';
  EXECUTE format('DROP TABLE IF EXISTS %I', items_table);
  EXECUTE format('DROP TABLE IF EXISTS %I', topics_table);
END $$;

-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin

DO $$
DECLARE
  topics_table text;
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

  EXECUTE format(
    'UPDATE %I
        SET sort_order = 1, updated_at = now()
      WHERE kind = ''franchise'' AND sort_order <> 1',
    topics_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SELECT 1;

-- +goose StatementEnd

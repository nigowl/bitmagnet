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
        SET description = '''', updated_at = now()
      WHERE (kind = ''franchise'' AND description = ''Movie series from metadata.'')
         OR (id = ''curated:popular-series'' AND description = ''Popular TV series in the local library.'')',
    topics_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
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
        SET description = CASE
          WHEN kind = ''franchise'' THEN ''Movie series from metadata.''
          WHEN id = ''curated:popular-series'' THEN ''Popular TV series in the local library.''
          ELSE description
        END,
        updated_at = now()
      WHERE kind = ''franchise'' OR id = ''curated:popular-series''',
    topics_table
  );
END $$;

-- +goose StatementEnd

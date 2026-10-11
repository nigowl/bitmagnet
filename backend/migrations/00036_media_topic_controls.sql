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
    'ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT ''custom'',
      ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true',
    topics_table
  );

  EXECUTE format(
    'UPDATE %I
       SET module = CASE id
         WHEN ''curated:high-rated-movies'' THEN ''high-rated''
         WHEN ''curated:popular-movies'' THEN ''popular''
         WHEN ''curated:popular-series'' THEN ''popular''
         WHEN ''curated:popular-anime'' THEN ''popular''
         WHEN ''curated:award-winning'' THEN ''award-winning''
         ELSE module
       END
     WHERE kind = ''curated''',
    topics_table
  );

  EXECUTE format(
    'UPDATE %I SET module = ''series'' WHERE kind = ''franchise''',
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

  EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS module, DROP COLUMN IF EXISTS enabled', topics_table);
END $$;

-- +goose StatementEnd

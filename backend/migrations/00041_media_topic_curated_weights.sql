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
        SET sort_order = CASE id
          WHEN ''curated:high-rated-movies'' THEN 40
          WHEN ''curated:popular-movies'' THEN 30
          WHEN ''curated:popular-series'' THEN 20
          WHEN ''curated:award-winning'' THEN 10
          ELSE sort_order
        END,
        updated_at = now()
      WHERE id IN (
        ''curated:high-rated-movies'',
        ''curated:popular-movies'',
        ''curated:popular-series'',
        ''curated:award-winning''
      )',
    topics_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SELECT 1;

-- +goose StatementEnd

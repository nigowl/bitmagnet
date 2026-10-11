-- +goose Up
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

  EXECUTE format('DELETE FROM %I WHERE topic_id = $1', items_table)
    USING 'curated:popular-anime';
  EXECUTE format('DELETE FROM %I WHERE id = $1', topics_table)
    USING 'curated:popular-anime';
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- The removed generated topic is recreated only by the topic generator, which
-- intentionally no longer includes popular anime.

-- +goose StatementEnd

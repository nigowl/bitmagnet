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
      WHERE id IN (''curated:high-rated-movies'', ''curated:popular-movies'', ''curated:award-winning'')
        AND description IN (
          ''Movies with a rating of 8 or higher.'',
          ''Popular movie resources in the local library.'',
          ''Movies with award metadata.'',
          ''评分达到 8 分及以上的电影。'',
          ''本地影视库中的热门电影资源。'',
          ''包含奖项元数据的电影。''
        )',
    topics_table
  );
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

SELECT 1;

-- +goose StatementEnd

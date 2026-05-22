-- Optional media search indexes.
--
-- Run this manually during a maintenance window when media search needs faster
-- multi-field fuzzy matching. Keep it outside automatic migrations because
-- trigram GIN indexes can take long enough to exceed application startup
-- deadlines on large libraries.
--
-- Default tables:
--   psql "$DATABASE_URL" -f scripts/create-media-search-indexes.sql
--
-- Prefixed tables, for example bm_media_entries:
--   psql "$DATABASE_URL" -v media_entries_table=bm_media_entries -f scripts/create-media-search-indexes.sql

\if :{?media_entries_table}
\else
\set media_entries_table media_entries
\endif

\set media_search_index :media_entries_table _search_text_trgm_idx

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS :"media_search_index"
ON :"media_entries_table" USING gin ((
  COALESCE(title, '') || E'\n' ||
  COALESCE(name_original, '') || E'\n' ||
  COALESCE(name_en, '') || E'\n' ||
  COALESCE(name_zh, '') || E'\n' ||
  COALESCE(overview_original, '') || E'\n' ||
  COALESCE(overview_en, '') || E'\n' ||
  COALESCE(overview_zh, '') || E'\n' ||
  COALESCE(tagline, '') || E'\n' ||
  COALESCE(CAST(title_aliases AS text), '') || E'\n' ||
  COALESCE(CAST(cast_members AS text), '') || E'\n' ||
  COALESCE(CAST(director_names AS text), '') || E'\n' ||
  COALESCE(CAST(writer_names AS text), '') || E'\n' ||
  COALESCE(CAST(creator_names AS text), '') || E'\n' ||
  COALESCE(CAST(release_year AS text), '') || E'\n' ||
  COALESCE(CAST(attributes AS text), '')
) gin_trgm_ops)
WHERE torrent_count > 0;

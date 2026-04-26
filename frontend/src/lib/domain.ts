export const contentTypes = [
  "movie",
  "tv_show",
  "music",
  "ebook",
  "comic",
  "audiobook",
  "game",
  "software",
  "xxx"
] as const;

export const queueStatuses = ["pending", "retry", "failed", "processed"] as const;

export const queueOrderFields = ["ran_at", "created_at", "priority"] as const;

export const torrentOrderFields = [
  "updated_at",
  "published_at",
  "size",
  "files_count",
  "seeders",
  "leechers",
  "relevance",
  "name",
  "info_hash"
] as const;

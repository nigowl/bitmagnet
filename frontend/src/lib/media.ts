import type { MediaDetailAttribute, MediaDetailTorrent } from "@/lib/media-api";
import { apiBaseURL } from "@/lib/api";

export type MediaCollection = {
  type: string;
  name: string;
};

export type MediaAttribute = {
  source: string;
  key: string;
  value: string;
};

export type MediaFactKey =
  | "country"
  | "network"
  | "studio"
  | "awards"
  | "status"
  | "director"
  | "writer"
  | "creator"
  | "cast"
  | "certification";

export type MediaFactGroup = {
  key: MediaFactKey;
  values: string[];
};

export type MediaExternalLink = {
  key: string;
  label: string;
  href: string;
  value: string;
};

export type MediaLikeItem = {
  id?: string | null;
  title?: string | null;
  nameOriginal?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  originalTitle?: string | null;
  isAnime?: boolean | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  qualityTags?: string[] | null;
  genres?: string[] | null;
  languages?: Array<string | { name?: string }> | null;
  content?: {
    title?: string | null;
    collections?: MediaCollection[] | null;
    attributes?: MediaAttribute[] | null;
  } | null;
};

export type MediaTitleLanguage = "original" | "zh" | "en";

export type MediaCoverSize = "sm" | "md" | "lg" | "xl";

function normalizeTMDBImage(path?: string | null, size = "w780"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}/${path.replace(/^\/+/, "")}`;
}

function buildCachedMediaImageURL(mediaID: string, kind: "poster" | "backdrop", size: MediaCoverSize): string {
  const path = `/api/media/${encodeURIComponent(mediaID)}/cover/${kind}/${size}`;
  return apiBaseURL ? `${apiBaseURL}${path}` : path;
}

function tmdbPosterSize(size: MediaCoverSize): string {
  switch (size) {
    case "sm":
      return "w342";
    case "md":
      return "w500";
    case "lg":
      return "w780";
    case "xl":
      return "w1280";
    default:
      return "w500";
  }
}

function tmdbBackdropSize(size: MediaCoverSize): string {
  switch (size) {
    case "sm":
      return "w780";
    case "md":
      return "w1280";
    case "lg":
      return "w1280";
    case "xl":
      return "original";
    default:
      return "w1280";
  }
}

function extractPosterPath(item: MediaLikeItem): string | null {
  if (item.posterPath) return item.posterPath;

  const posterPath = item.content?.attributes?.find((attr) => attr.source === "tmdb" && attr.key === "poster_path")?.value || null;
  return posterPath;
}

function extractBackdropPath(item: MediaLikeItem): string | null {
  if (item.backdropPath) return item.backdropPath;

  const backdropPath = item.content?.attributes?.find((attr) => attr.source === "tmdb" && attr.key === "backdrop_path")?.value || null;
  return backdropPath;
}

export function getPosterUrl(item: MediaLikeItem, size: MediaCoverSize = "md"): string | null {
  const posterPath = extractPosterPath(item);
  if (!posterPath) return null;

  if (item.id) {
    return buildCachedMediaImageURL(item.id, "poster", size);
  }

  return normalizeTMDBImage(posterPath, tmdbPosterSize(size));
}

export function getBackdropUrl(item: MediaLikeItem, size: MediaCoverSize = "lg"): string | null {
  const backdropPath = extractBackdropPath(item);
  if (!backdropPath) return null;

  if (item.id) {
    return buildCachedMediaImageURL(item.id, "backdrop", size);
  }

  return normalizeTMDBImage(backdropPath, tmdbBackdropSize(size));
}

function firstNonEmptyText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function getDisplayTitle(item: MediaLikeItem, language: MediaTitleLanguage = "original"): string {
  const original = firstNonEmptyText(item.nameOriginal, item.originalTitle, item.title, item.content?.title);
  const zh = firstNonEmptyText(item.nameZh);
  const en = firstNonEmptyText(item.nameEn);

  if (language === "zh") {
    return firstNonEmptyText(zh, en, original) || "-";
  }
  if (language === "en") {
    return firstNonEmptyText(en, zh, original) || "-";
  }
  return original || "-";
}

export function isAnimeItem(item: MediaLikeItem): boolean {
  if (item.isAnime) return true;

  const genreNames = (item.content?.collections || [])
    .filter((collection) => collection.type === "genre")
    .map((collection) => collection.name?.toLowerCase() || "")
    .filter(Boolean);

  const title = getDisplayTitle(item).toLowerCase();
  const animeKeywords = ["animation", "anime", "动漫", "动画", "番"];

  return animeKeywords.some((keyword) => title.includes(keyword) || genreNames.some((name) => name.includes(keyword)));
}

export function formatQualityTag(value?: string | null): string {
  if (!value) return "";

  const tag = value.trim();
  if (!tag) return "";

  if (/^V\d+p$/i.test(tag)) {
    return tag.slice(1);
  }

  switch (tag.toUpperCase()) {
    case "WEBDL":
      return "WEB-DL";
    case "WEBRIP":
      return "WEBRip";
    case "BLURAY":
      return "BluRay";
    case "V3D":
    case "V3DSBS":
    case "V3DOU":
      return "3D";
    default:
      return tag;
  }
}

function qualityTagScore(value: string): number {
  const normalized = value.trim().toUpperCase().replace(/[\s_-]/g, "");
  switch (normalized) {
    case "V4320P":
      return 100;
    case "V2160P":
      return 90;
    case "V1440P":
      return 80;
    case "V1080P":
      return 70;
    case "V720P":
      return 60;
    case "V480P":
      return 50;
    case "V360P":
      return 40;
    case "BLURAY":
    case "REMUX":
      return 30;
    case "WEBDL":
      return 20;
    case "WEBRIP":
      return 10;
    default:
      return 0;
  }
}

export function pickBestQualityTag(tags: string[] | null | undefined): string | null {
  const normalized = toArray(tags).map((tag) => tag.trim()).filter(Boolean);
  if (normalized.length === 0) return null;

  const sorted = [...normalized].sort((left, right) => qualityTagScore(right) - qualityTagScore(left));
  const best = formatQualityTag(sorted[0]);
  return best || null;
}

function toArray<T>(value?: T[] | null): T[] {
  return Array.isArray(value) ? value : [];
}

function pushUnique(target: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return;
  if (!target.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

function flattenParsedValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return splitDisplayValues(value);
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenParsedValue(entry));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "name",
      "title",
      "original_name",
      "english_name",
      "label",
      "value",
      "iso_3166_1",
      "iso_639_1",
      "status",
      "certification"
    ];

    for (const key of preferredKeys) {
      const matched = record[key];
      const results = flattenParsedValue(matched);
      if (results.length > 0) {
        return results;
      }
    }

    return [];
  }

  return [];
}

function splitDisplayValues(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try {
      return flattenParsedValue(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  if (trimmed.length > 120) {
    return [trimmed];
  }

  return trimmed
    .split(/\s*[|/;,]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function factKeyFromAttributeKey(rawKey: string): MediaFactKey | null {
  const key = rawKey.toLowerCase();

  if (/(award|awards|accolade|accolades|prize|prizes|wins|nominations)/.test(key)) return "awards";
  if (/(production_compan|studio|studios|company|companies)/.test(key)) return "studio";
  if (/(network|networks|platform|stream|channel|distributor)/.test(key)) return "network";
  if (/(production_countr|origin_countr|countr|region|regions|origin_region)/.test(key)) return "country";
  if (/(director|directors)/.test(key)) return "director";
  if (/(writer|writers|screenplay|story|teleplay)/.test(key)) return "writer";
  if (/(creator|creators|showrunner)/.test(key)) return "creator";
  if (/(cast|actors|actor|starring|stars)/.test(key)) return "cast";
  if (/(status|release_status)/.test(key)) return "status";
  if (/(certification|rated|mpaa|age_rating)/.test(key)) return "certification";

  return null;
}

function findAttributeValue(attributes: MediaDetailAttribute[] | null | undefined, keys: string[]): string | null {
  for (const attribute of toArray(attributes)) {
    const normalizedKey = attribute.key.trim().toLowerCase();
    if (keys.includes(normalizedKey) && attribute.value.trim()) {
      return attribute.value.trim();
    }
  }
  return null;
}

function normalizeExternalID(source: string, id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";

  if (source === "imdb" && !trimmed.startsWith("tt")) {
    return `tt${trimmed}`;
  }

  return trimmed;
}

function buildExternalLink(contentType: string, source: string, id: string): MediaExternalLink | null {
  const normalizedSource = source.trim().toLowerCase();
  const normalizedID = normalizeExternalID(normalizedSource, id);
  if (!normalizedID) return null;

  switch (normalizedSource) {
    case "tmdb":
      return {
        key: "tmdb",
        label: "TMDB",
        href: `https://www.themoviedb.org/${contentType === "tv_show" ? "tv" : "movie"}/${normalizedID}`,
        value: normalizedID
      };
    case "imdb":
      return {
        key: "imdb",
        label: "IMDb",
        href: `https://www.imdb.com/title/${normalizedID}`,
        value: normalizedID
      };
    case "tvdb":
      return {
        key: "tvdb",
        label: "TVDB",
        href: `https://www.thetvdb.com/dereferrer/series/${normalizedID}`,
        value: normalizedID
      };
    case "douban":
      return {
        key: "douban",
        label: "Douban",
        href: `https://movie.douban.com/subject/${normalizedID}/`,
        value: normalizedID
      };
    default:
      return null;
  }
}

export function buildMediaExternalLinks(input: {
  contentType: string;
  contentSource: string;
  contentId: string;
  title?: string;
  releaseYear?: number;
  imdbId?: string;
  doubanId?: string;
  attributes?: MediaDetailAttribute[] | null;
}): MediaExternalLink[] {
  const links: MediaExternalLink[] = [];
  const seen = new Set<string>();

  const pushLink = (link: MediaExternalLink | null) => {
    if (!link || seen.has(link.href)) return;
    seen.add(link.href);
    links.push(link);
  };

  pushLink(buildExternalLink(input.contentType, input.contentSource, input.contentId));
  pushLink(buildExternalLink(input.contentType, "imdb", input.imdbId || ""));
  pushLink(buildExternalLink(input.contentType, "douban", input.doubanId || ""));

  const doubanIDKeys = new Set(["douban_id", "doubanid", "subject_id", "subjectid"]);
  for (const attribute of toArray(input.attributes)) {
    const normalizedKey = attribute.key.trim().toLowerCase();
    if (normalizedKey === "id" || (attribute.source.trim().toLowerCase() === "douban" && doubanIDKeys.has(normalizedKey))) {
      pushLink(buildExternalLink(input.contentType, attribute.source, attribute.value));
    }
  }

  const homepage = findAttributeValue(input.attributes, ["homepage", "official_site", "website", "url"]);
  if (homepage && /^https?:\/\//i.test(homepage)) {
    pushLink({
      key: "homepage",
      label: "Official",
      href: homepage,
      value: homepage
    });
  }

  return links;
}

function resolutionScore(value?: string | null): number {
  const normalized = (value || "").toUpperCase();
  switch (normalized) {
    case "V4320P":
      return 7;
    case "V2160P":
      return 6;
    case "V1440P":
      return 5;
    case "V1080P":
      return 4;
    case "V720P":
      return 3;
    case "V480P":
      return 2;
    case "V360P":
      return 1;
    default:
      return 0;
  }
}

function sourceScore(value?: string | null): number {
  const normalized = (value || "").toUpperCase();
  switch (normalized) {
    case "BLURAY":
      return 5;
    case "REMUX":
      return 5;
    case "WEBDL":
      return 4;
    case "WEBRIP":
      return 3;
    case "HDTV":
      return 2;
    case "DVD":
      return 1;
    default:
      return 0;
  }
}

function scoreTorrent(item: MediaDetailTorrent): number {
  const seeders = item.seeders || 0;
  const leechers = item.leechers || 0;
  const fileCount = item.filesCount || item.torrent.filesCount || 0;

  return (
    seeders * 10000 +
    resolutionScore(item.videoResolution) * 1000 +
    sourceScore(item.videoSource) * 100 +
    Math.min(leechers, 99) * 10 +
    Math.min(fileCount, 99)
  );
}

export function pickRecommendedTorrent(torrents: MediaDetailTorrent[] | null | undefined): MediaDetailTorrent | null {
  const items = toArray(torrents);
  if (items.length === 0) return null;

  return [...items].sort((left, right) => {
    const scoreDiff = scoreTorrent(right) - scoreTorrent(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.size - left.size;
  })[0] ?? null;
}

export function extractMediaFacts(input: {
  collections?: MediaCollection[] | null;
  attributes?: MediaAttribute[] | null;
}): MediaFactGroup[] {
  const buckets: Record<MediaFactKey, string[]> = {
    country: [],
    network: [],
    studio: [],
    awards: [],
    status: [],
    director: [],
    writer: [],
    creator: [],
    cast: [],
    certification: []
  };

  for (const collection of toArray(input.collections)) {
    const type = collection.type.toLowerCase();
    if (type === "country" || type === "region" || type === "network" || type === "studio") {
      const targetKey = type === "region" ? "country" : (type as "country" | "network" | "studio");
      pushUnique(buckets[targetKey], collection.name);
    }
  }

  for (const attribute of toArray(input.attributes)) {
    const factKey = factKeyFromAttributeKey(attribute.key);
    if (!factKey) continue;

    for (const value of splitDisplayValues(attribute.value)) {
      pushUnique(buckets[factKey], value);
    }
  }

  const order: MediaFactKey[] = [
    "country",
    "network",
    "studio",
    "awards",
    "status",
    "director",
    "writer",
    "creator",
    "cast",
    "certification"
  ];

  return order
    .map((key) => ({ key, values: buckets[key] }))
    .filter((group) => group.values.length > 0);
}

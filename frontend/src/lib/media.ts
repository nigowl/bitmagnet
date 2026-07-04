import type { MediaDetailTorrent } from "@/lib/media-api";
import { apiBaseURL } from "@/lib/api";
import { md5 } from "@/lib/md5";
import { resolveInternalHref } from "@/lib/navigation";
import { firstNonEmptyText } from "@/lib/text";
export { buildMediaExternalLinks, extractMediaFacts } from "@/lib/media-facts";
export type { MediaExternalLink, MediaFactGroup, MediaFactKey } from "@/lib/media-facts";

export type MediaCollection = {
  type: string;
  name: string;
};

export type MediaAttribute = {
  source: string;
  key: string;
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
export type MediaCategory = "movie" | "series" | "anime";

export type MediaCoverSize = "sm" | "md" | "lg" | "xl";

export function normalizeContentType(type?: string | null): string {
  const normalized = typeof type === "string" ? type.trim().toLowerCase() : "";
  return normalized === "0" ? "" : normalized;
}

export function buildMediaEntryIdFromContentRef(
  contentType?: string | null,
  contentSource?: string | null,
  contentId?: string | null
): string | null {
  const type = contentType?.trim();
  const source = contentSource?.trim();
  const id = contentId?.trim();
  if (!type || !source || !id) return null;
  return md5(`${type}:${source}:${id}`);
}

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

export function getOriginalTitleIfDifferent(item: MediaLikeItem, title: string): string | null {
  const original = getDisplayTitle(item, "original");
  return original.trim().toLowerCase() !== title.trim().toLowerCase() ? original : null;
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

export function resolveMediaCategory(item: MediaLikeItem & { contentType?: string | null }): MediaCategory {
  if (isAnimeItem(item)) {
    return "anime";
  }

  const type = (item.contentType || "").toLowerCase();
  if (type === "movie") {
    return "movie";
  }
  if (type === "tv_show" || type === "series") {
    return "series";
  }
  return "movie";
}

export function buildMediaDetailHref(
  item: MediaLikeItem & { id: string; contentType?: string | null },
  sourceHref?: string | null
): string {
  const category = resolveMediaCategory(item);
  const baseHref = `/media/${category}/${encodeURIComponent(item.id)}`;
  const normalizedSource = resolveInternalHref(sourceHref, "");
  if (!normalizedSource) {
    return baseHref;
  }

  const params = new URLSearchParams();
  params.set("from", normalizedSource);
  return `${baseHref}?${params.toString()}`;
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

export function uniqueMediaTags(tags: string[] | null | undefined): string[] {
  return Array.from(new Set(toArray(tags).map((tag) => tag.trim()).filter(Boolean)));
}

function toArray<T>(value?: T[] | null): T[] {
	return Array.isArray(value) ? value : [];
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
  return pickRecommendedTorrents(torrents, 1)[0] ?? null;
}

export function pickRecommendedTorrents(torrents: MediaDetailTorrent[] | null | undefined, limit = 3): MediaDetailTorrent[] {
  const items = toArray(torrents);
  if (items.length === 0) return [];

  return [...items].sort((left, right) => {
    const scoreDiff = scoreTorrent(right) - scoreTorrent(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.size - left.size;
  }).slice(0, Math.max(1, limit));
}

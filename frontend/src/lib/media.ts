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
export type MediaCategory = "movie" | "series" | "anime";

export type MediaCoverSize = "sm" | "md" | "lg" | "xl";

function rotateLeft(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

function addUnsigned(left: number, right: number): number {
  return (((left >>> 0) + (right >>> 0)) & 0xffffffff) >>> 0;
}

function md5BlockFF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned((b & c) | (~b & d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockGG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned((b & d) | (c & ~d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockHH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned(b ^ c ^ d, addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockII(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned(c ^ (b | ~d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function wordToHex(value: number): string {
  let output = "";
  for (let index = 0; index <= 3; index += 1) {
    output += (`0${((value >>> (index * 8)) & 0xff).toString(16)}`).slice(-2);
  }
  return output;
}

function bytesToWordArray(bytes: number[]): number[] {
  const wordCount = (((bytes.length + 8) >>> 6) + 1) * 16;
  const words = new Array<number>(wordCount).fill(0);

  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] |= bytes[index] << ((index % 4) * 8);
  }

  words[bytes.length >>> 2] |= 0x80 << ((bytes.length % 4) * 8);
  const bitLength = bytes.length * 8;
  words[wordCount - 2] = bitLength & 0xffffffff;
  words[wordCount - 1] = Math.floor(bitLength / 0x100000000);

  return words;
}

function md5(value: string): string {
  const input = bytesToWordArray(Array.from(new TextEncoder().encode(value)));
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let k = 0; k < input.length; k += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    a = md5BlockFF(a, b, c, d, input[k + 0], 7, 0xd76aa478);
    d = md5BlockFF(d, a, b, c, input[k + 1], 12, 0xe8c7b756);
    c = md5BlockFF(c, d, a, b, input[k + 2], 17, 0x242070db);
    b = md5BlockFF(b, c, d, a, input[k + 3], 22, 0xc1bdceee);
    a = md5BlockFF(a, b, c, d, input[k + 4], 7, 0xf57c0faf);
    d = md5BlockFF(d, a, b, c, input[k + 5], 12, 0x4787c62a);
    c = md5BlockFF(c, d, a, b, input[k + 6], 17, 0xa8304613);
    b = md5BlockFF(b, c, d, a, input[k + 7], 22, 0xfd469501);
    a = md5BlockFF(a, b, c, d, input[k + 8], 7, 0x698098d8);
    d = md5BlockFF(d, a, b, c, input[k + 9], 12, 0x8b44f7af);
    c = md5BlockFF(c, d, a, b, input[k + 10], 17, 0xffff5bb1);
    b = md5BlockFF(b, c, d, a, input[k + 11], 22, 0x895cd7be);
    a = md5BlockFF(a, b, c, d, input[k + 12], 7, 0x6b901122);
    d = md5BlockFF(d, a, b, c, input[k + 13], 12, 0xfd987193);
    c = md5BlockFF(c, d, a, b, input[k + 14], 17, 0xa679438e);
    b = md5BlockFF(b, c, d, a, input[k + 15], 22, 0x49b40821);

    a = md5BlockGG(a, b, c, d, input[k + 1], 5, 0xf61e2562);
    d = md5BlockGG(d, a, b, c, input[k + 6], 9, 0xc040b340);
    c = md5BlockGG(c, d, a, b, input[k + 11], 14, 0x265e5a51);
    b = md5BlockGG(b, c, d, a, input[k + 0], 20, 0xe9b6c7aa);
    a = md5BlockGG(a, b, c, d, input[k + 5], 5, 0xd62f105d);
    d = md5BlockGG(d, a, b, c, input[k + 10], 9, 0x02441453);
    c = md5BlockGG(c, d, a, b, input[k + 15], 14, 0xd8a1e681);
    b = md5BlockGG(b, c, d, a, input[k + 4], 20, 0xe7d3fbc8);
    a = md5BlockGG(a, b, c, d, input[k + 9], 5, 0x21e1cde6);
    d = md5BlockGG(d, a, b, c, input[k + 14], 9, 0xc33707d6);
    c = md5BlockGG(c, d, a, b, input[k + 3], 14, 0xf4d50d87);
    b = md5BlockGG(b, c, d, a, input[k + 8], 20, 0x455a14ed);
    a = md5BlockGG(a, b, c, d, input[k + 13], 5, 0xa9e3e905);
    d = md5BlockGG(d, a, b, c, input[k + 2], 9, 0xfcefa3f8);
    c = md5BlockGG(c, d, a, b, input[k + 7], 14, 0x676f02d9);
    b = md5BlockGG(b, c, d, a, input[k + 12], 20, 0x8d2a4c8a);

    a = md5BlockHH(a, b, c, d, input[k + 5], 4, 0xfffa3942);
    d = md5BlockHH(d, a, b, c, input[k + 8], 11, 0x8771f681);
    c = md5BlockHH(c, d, a, b, input[k + 11], 16, 0x6d9d6122);
    b = md5BlockHH(b, c, d, a, input[k + 14], 23, 0xfde5380c);
    a = md5BlockHH(a, b, c, d, input[k + 1], 4, 0xa4beea44);
    d = md5BlockHH(d, a, b, c, input[k + 4], 11, 0x4bdecfa9);
    c = md5BlockHH(c, d, a, b, input[k + 7], 16, 0xf6bb4b60);
    b = md5BlockHH(b, c, d, a, input[k + 10], 23, 0xbebfbc70);
    a = md5BlockHH(a, b, c, d, input[k + 13], 4, 0x289b7ec6);
    d = md5BlockHH(d, a, b, c, input[k + 0], 11, 0xeaa127fa);
    c = md5BlockHH(c, d, a, b, input[k + 3], 16, 0xd4ef3085);
    b = md5BlockHH(b, c, d, a, input[k + 6], 23, 0x04881d05);
    a = md5BlockHH(a, b, c, d, input[k + 9], 4, 0xd9d4d039);
    d = md5BlockHH(d, a, b, c, input[k + 12], 11, 0xe6db99e5);
    c = md5BlockHH(c, d, a, b, input[k + 15], 16, 0x1fa27cf8);
    b = md5BlockHH(b, c, d, a, input[k + 2], 23, 0xc4ac5665);

    a = md5BlockII(a, b, c, d, input[k + 0], 6, 0xf4292244);
    d = md5BlockII(d, a, b, c, input[k + 7], 10, 0x432aff97);
    c = md5BlockII(c, d, a, b, input[k + 14], 15, 0xab9423a7);
    b = md5BlockII(b, c, d, a, input[k + 5], 21, 0xfc93a039);
    a = md5BlockII(a, b, c, d, input[k + 12], 6, 0x655b59c3);
    d = md5BlockII(d, a, b, c, input[k + 3], 10, 0x8f0ccc92);
    c = md5BlockII(c, d, a, b, input[k + 10], 15, 0xffeff47d);
    b = md5BlockII(b, c, d, a, input[k + 1], 21, 0x85845dd1);
    a = md5BlockII(a, b, c, d, input[k + 8], 6, 0x6fa87e4f);
    d = md5BlockII(d, a, b, c, input[k + 15], 10, 0xfe2ce6e0);
    c = md5BlockII(c, d, a, b, input[k + 6], 15, 0xa3014314);
    b = md5BlockII(b, c, d, a, input[k + 13], 21, 0x4e0811a1);
    a = md5BlockII(a, b, c, d, input[k + 4], 6, 0xf7537e82);
    d = md5BlockII(d, a, b, c, input[k + 11], 10, 0xbd3af235);
    c = md5BlockII(c, d, a, b, input[k + 2], 15, 0x2ad7d2bb);
    b = md5BlockII(b, c, d, a, input[k + 9], 21, 0xeb86d391);

    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
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
  const normalizedSource = sourceHref?.trim();
  if (!normalizedSource || !normalizedSource.startsWith("/") || normalizedSource.startsWith("//")) {
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

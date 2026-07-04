import type { MediaDetailAttribute } from "@/lib/media-api";
import type { MediaAttribute, MediaCollection } from "@/lib/media";

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

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
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
  const key = normalizeLookupKey(rawKey);

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
    const normalizedKey = normalizeLookupKey(attribute.key);
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
  const normalizedSource = normalizeLookupKey(source);
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
    const normalizedKey = normalizeLookupKey(attribute.key);
    if (normalizedKey === "id" || (normalizeLookupKey(attribute.source) === "douban" && doubanIDKeys.has(normalizedKey))) {
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

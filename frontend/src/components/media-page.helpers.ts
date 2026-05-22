export type MediaCategory = "movie" | "series" | "anime";
export type FilterRowKey = "quality" | "year" | "genre" | "language" | "country" | "network" | "studio" | "awards" | "sort";
export type FilterOption = {
  value: string;
  label: string;
};

export const MEDIA_LIST_TARGET_COUNT = 40;
const MEDIA_LIST_MIN_CARD_WIDTH = 188;
const MEDIA_LIST_GRID_GAP = 16;

export const MEDIA_FILTER_KEYS_BY_CATEGORY: Record<MediaCategory, FilterRowKey[]> = {
  movie: ["quality", "year", "genre", "language", "country", "studio", "awards", "sort"],
  series: ["quality", "year", "genre", "language", "country", "network", "sort"],
  anime: ["quality", "year", "genre", "language", "studio", "sort"]
};

export function normalizeSimpleValue(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeMediaToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function localizeGenreLabel(value: string, t: (key: string) => string): string {
  const normalized = normalizeMediaToken(value);
  const aliases: Record<string, string> = {
    sciencefiction: "science_fiction",
    sci_fi: "sci_fi",
    sci_fi_and_fantasy: "science_fiction",
    action_and_adventure: "action_adventure",
    war_and_politics: "war_politics"
  };
  const key = aliases[normalized] || normalized;
  const translationKey = `media.genres.${key}`;
  const translated = t(translationKey);
  return translated === translationKey ? value : translated;
}

export function resolveAdaptiveMediaListCount(containerWidth: number, targetCount: number = MEDIA_LIST_TARGET_COUNT): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return targetCount;
  }
  const columns = Math.max(1, Math.floor((containerWidth + MEDIA_LIST_GRID_GAP) / (MEDIA_LIST_MIN_CARD_WIDTH + MEDIA_LIST_GRID_GAP)));
  const lower = Math.max(columns, Math.floor(targetCount / columns) * columns);
  const upper = Math.max(columns, Math.ceil(targetCount / columns) * columns);
  if (Math.abs(targetCount - lower) <= Math.abs(upper - targetCount)) {
    return lower;
  }
  return upper;
}

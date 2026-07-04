import type { MediaDetailResponse, MediaDetailTorrent, PlayerTransmissionTaskStatus } from "@/lib/media-api";
export { formatBytes } from "@/lib/format";
export { normalizeInfoHash } from "@/lib/info-hash";
export { resolveInternalHref as resolveReturnHref } from "@/lib/navigation";
export { firstNonEmptyText as firstNonEmpty, sameText } from "@/lib/text";

type TranslationFn = (key: string) => string;
type MediaDetailItem = MediaDetailResponse["item"];
export type MediaDetailMetaRow = { label: string; value: string };

export function displayResolution(value?: string): string {
  if (!value) return "-";
  return value.startsWith("V") ? value.slice(1) : value;
}

export function normalizeResolutionFilter(value?: string | null): string {
  return displayResolution(value || "").trim().toLowerCase();
}

export function resolutionSortValue(value: string): number {
  const match = value.trim().toLowerCase().match(/(\d{3,4})p?/);
  if (!match) return -1;
  return Number(match[1]) || -1;
}

export function rowValue(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function numericMetric(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function timestampMetric(value?: string | null): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareMediaDetailTorrents(left: MediaDetailTorrent, right: MediaDetailTorrent): number {
  const leftHasSwarm = numericMetric(left.seeders) >= 0 || numericMetric(left.leechers) >= 0;
  const rightHasSwarm = numericMetric(right.seeders) >= 0 || numericMetric(right.leechers) >= 0;
  if (leftHasSwarm !== rightHasSwarm) return rightHasSwarm ? 1 : -1;

  const leftSeeders = numericMetric(left.seeders);
  const rightSeeders = numericMetric(right.seeders);
  if (leftSeeders !== rightSeeders) return rightSeeders - leftSeeders;

  const leftLeechers = numericMetric(left.leechers);
  const rightLeechers = numericMetric(right.leechers);
  if (leftLeechers !== rightLeechers) return rightLeechers - leftLeechers;

  const leftResolution = resolutionSortValue(displayResolution(left.videoResolution));
  const rightResolution = resolutionSortValue(displayResolution(right.videoResolution));
  if (leftResolution !== rightResolution) return rightResolution - leftResolution;

  if (left.size !== right.size) return right.size - left.size;
  return timestampMetric(right.updatedAt) - timestampMetric(left.updatedAt);
}

export function metadataValue(value?: string | number | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function metadataList(values?: string[] | null): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) return null;
  return normalized.join(" / ");
}

export function buildMediaDetailMetaRows({
  t,
  item,
  releaseInfo,
  languageInfo
}: {
  t: TranslationFn;
  item: MediaDetailItem;
  releaseInfo: string[];
  languageInfo: string[];
}): MediaDetailMetaRow[] {
  return [
    { label: t("media.detail.tagline"), value: metadataValue(item.tagline) },
    { label: t("media.detail.status"), value: metadataValue(item.statusText) },
    { label: t("media.detail.homepage"), value: metadataValue(item.homepageUrl) },
    { label: t("media.detail.releaseTimeline"), value: metadataList(releaseInfo) },
    { label: t("media.detail.season"), value: metadataValue(item.seasonCount) },
    { label: t("media.detail.episodeCount"), value: metadataValue(item.episodeCount) },
    { label: t("media.detail.runtime"), value: metadataValue(item.runtime) },
    { label: t("media.detail.languageSummary"), value: metadataList(languageInfo) },
    { label: t("media.detail.productionCountries"), value: metadataList(item.productionCountries) },
    { label: t("media.detail.network"), value: metadataList(item.networkNames) },
    { label: t("media.detail.studio"), value: metadataList(item.studioNames) },
    { label: t("media.detail.awards"), value: metadataList(item.awardNames) },
    { label: t("media.detail.creator"), value: metadataList(item.creatorNames) },
    { label: t("media.detail.certification"), value: metadataValue(item.certification) },
    { label: t("media.detail.cast"), value: metadataList(item.castMembers) },
    { label: t("media.detail.director"), value: metadataList(item.directorNames) },
    { label: t("media.detail.writer"), value: metadataList(item.writerNames) },
    { label: t("media.detail.imdb"), value: metadataValue(item.imdbId) },
    { label: t("media.detail.douban"), value: metadataValue(item.doubanId) },
    { label: t("media.detail.rating"), value: item.voteAverage ? item.voteAverage.toFixed(1) : null },
    { label: t("media.detail.votes"), value: metadataValue(item.voteCount) },
    { label: t("media.detail.contentSource"), value: metadataValue(item.contentSource) },
    { label: t("media.detail.contentId"), value: metadataValue(item.contentId) },
    { label: t("media.detail.originalTitle"), value: metadataValue(item.originalTitle) },
    { label: t("media.torrentCount"), value: metadataValue(item.torrentCount) }
  ].filter((row): row is MediaDetailMetaRow => Boolean(row.value));
}

export function uniqueValues(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function compactInlineValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function fallbackCategoryHref(mediaType?: string): string {
  if (mediaType === "anime") return "/media/anime";
  if (mediaType === "series") return "/media/series";
  return "/media/movie";
}

export function applySubtitleTemplate(urlTemplate: string, title: string, releaseYear?: number): string | null {
  const template = urlTemplate.trim();
  if (!template) {
    return null;
  }

  const encodedTitle = encodeURIComponent(title);
  const resolved = template
    .replaceAll("{title}", encodedTitle)
    .replaceAll("{titleEncoded}", encodedTitle)
    .replaceAll("{titleRaw}", title)
    .replaceAll("{year}", releaseYear ? String(releaseYear) : "");

  try {
    const parsed = new URL(resolved);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isTransmissionTaskReady(status: PlayerTransmissionTaskStatus): boolean {
  const state = status.state.trim().toLowerCase();
  return status.progress >= 0.999 || state === "seeding" || state === "seed_wait";
}

export function isTransmissionTaskComplete(status?: PlayerTransmissionTaskStatus): boolean {
  if (!status?.exists) return false;
  return isTransmissionTaskReady(status);
}

export function resolvePlayerActionState(
  status: PlayerTransmissionTaskStatus | undefined
): { color: string; variant: "default" | "light" } {
  if (!status?.exists) {
    return { color: "slate", variant: "default" };
  }
  const state = status.state.trim().toLowerCase();
  if (isTransmissionTaskReady(status)) {
    return { color: "green", variant: "light" };
  }
  if (
    status.progress > 0 ||
    state === "downloading" ||
    state === "download_wait" ||
    state === "checking" ||
    state === "check_wait"
  ) {
    return { color: "yellow", variant: "light" };
  }
  return { color: "slate", variant: "default" };
}

import { PLAYBACK_RATE_OPTIONS, PLAYER_FILE_SELECTION_KEY_PREFIX, PLAYER_GLOBAL_PREFS_KEY_PREFIX, PLAYER_TRACK_PREFS_KEY_PREFIX, PLAYBACK_PROGRESS_KEY_PREFIX, SUBTITLE_RENDER_FONT_SIZE_OPTIONS, SUBTITLE_RENDER_LINE_HEIGHT_OPTIONS, SUBTITLE_SCALE_OPTIONS, TRANSCODE_OUTPUT_RESOLUTION_OPTIONS, TRANSCODE_PREBUFFER_DEFAULT_SECONDS, TRANSCODE_PREBUFFER_OPTIONS } from "./torrent-player-helpers.constants";
import type { PlaybackFileSelectionRecord, PlaybackProgressRecord, PlayerGlobalPreferences, PlayerTrackPreferences, SubtitleStylePreset } from "./torrent-player-helpers.types";
export { normalizeInfoHash } from "@/lib/info-hash";
export { firstNonEmptyText as firstNonEmpty } from "@/lib/text";

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

export function buildPlaybackProgressStorageKey(infoHash: string, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYBACK_PROGRESS_KEY_PREFIX}:${viewer}:${infoHash}`;
}

export function buildPlayerGlobalPreferencesStorageKey(userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_GLOBAL_PREFS_KEY_PREFIX}:${viewer}`;
}

export function buildPlayerTrackPreferencesStorageKey(infoHash: string, fileIndex: number, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_TRACK_PREFS_KEY_PREFIX}:${viewer}:${infoHash}:${fileIndex}`;
}

export function buildPlayerFileSelectionStorageKey(infoHash: string, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_FILE_SELECTION_KEY_PREFIX}:${viewer}:${infoHash}`;
}

export function readPlaybackProgressRecord(infoHash: string, userId?: number): PlaybackProgressRecord | null {
  if (typeof window === "undefined" || !infoHash) return null;
  try {
    const raw = window.localStorage.getItem(buildPlaybackProgressStorageKey(infoHash, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaybackProgressRecord;
    if (!parsed || parsed.infoHash !== infoHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readRememberedPlaybackFileIndex(infoHash: string, userId?: number): number {
  if (typeof window === "undefined" || !infoHash) return -1;
  try {
    const raw = window.localStorage.getItem(buildPlayerFileSelectionStorageKey(infoHash, userId));
    if (raw) {
      const parsed = JSON.parse(raw) as PlaybackFileSelectionRecord;
      const fileIndex = Number.isInteger(parsed?.fileIndex) ? Number(parsed.fileIndex) : -1;
      if (parsed?.infoHash === infoHash && fileIndex >= 0) {
        return fileIndex;
      }
    }
  } catch {
    // fall through to playback progress
  }
  const progress = readPlaybackProgressRecord(infoHash, userId);
  return Number.isInteger(progress?.fileIndex) && (progress?.fileIndex ?? -1) >= 0 ? Number(progress?.fileIndex) : -1;
}

export function writeRememberedPlaybackFileIndex(infoHash: string, userId: number | undefined, fileIndex: number): void {
  if (typeof window === "undefined" || !infoHash || !Number.isInteger(fileIndex) || fileIndex < 0) return;
  try {
    const payload: PlaybackFileSelectionRecord = {
      infoHash,
      fileIndex,
      updatedAt: Date.now()
    };
    window.localStorage.setItem(buildPlayerFileSelectionStorageKey(infoHash, userId), JSON.stringify(payload));
  } catch {
    // ignore storage quota/privacy failures
  }
}

export function normalizePlaybackRatePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  const matched = PLAYBACK_RATE_OPTIONS.find((value) => Math.abs(value - raw) < 0.01);
  return matched ?? 1;
}

export function normalizePrebufferPreference(raw: number): number {
  if (!Number.isFinite(raw)) return TRANSCODE_PREBUFFER_DEFAULT_SECONDS;
  const rounded = Math.round(raw);
  const matched = TRANSCODE_PREBUFFER_OPTIONS.find((value) => value === rounded);
  return matched ?? TRANSCODE_PREBUFFER_DEFAULT_SECONDS;
}

export function normalizeTranscodeOutputResolution(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  const matched = TRANSCODE_OUTPUT_RESOLUTION_OPTIONS.find((value) => value === rounded);
  return matched ?? 0;
}

export function normalizeVideoFitModePreference(raw: string | null | undefined): "contain" | "cover" | "fill" {
  if (raw === "cover" || raw === "fill") return raw;
  return "contain";
}

export function normalizeVideoBrightnessPreference(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.max(50, Math.min(200, Math.round(raw)));
}

export function normalizeVideoContrastPreference(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.max(50, Math.min(200, Math.round(raw)));
}

export function normalizeVideoSaturationPreference(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.max(50, Math.min(200, Math.round(raw)));
}

export function normalizeVideoHuePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-180, Math.min(180, Math.round(raw)));
}

export function normalizeSubtitleScalePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 1.15;
  const matched = SUBTITLE_SCALE_OPTIONS.find((value) => Math.abs(value - raw) < 0.01);
  return matched ?? 1.15;
}

export function resolveRenderedSubtitleLineHeight(raw: number): number {
  const normalized = normalizeSubtitleScalePreference(raw);
  const index = SUBTITLE_SCALE_OPTIONS.findIndex((value) => Math.abs(value - normalized) < 0.01);
  if (index < 0) return 1.3;
  return SUBTITLE_RENDER_LINE_HEIGHT_OPTIONS[index] ?? 1.3;
}

export function resolveRenderedSubtitleFontSize(raw: number): number {
  const normalized = normalizeSubtitleScalePreference(raw);
  const index = SUBTITLE_SCALE_OPTIONS.findIndex((value) => Math.abs(value - normalized) < 0.01);
  if (index < 0) return 23;
  return SUBTITLE_RENDER_FONT_SIZE_OPTIONS[index] ?? 23;
}

export function normalizeSubtitleVerticalPercentPreference(raw: number): number {
  const options = [0, 4, 8, 12, 15, 18] as const;
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  let best: number = options[0];
  let delta = Math.abs(rounded - best);
  for (const option of options) {
    const currentDelta = Math.abs(rounded - option);
    if (currentDelta < delta) {
      best = option;
      delta = currentDelta;
    }
  }
  return best;
}

export type { PlayerGlobalPreferences, PlayerTrackPreferences, SubtitleStylePreset };

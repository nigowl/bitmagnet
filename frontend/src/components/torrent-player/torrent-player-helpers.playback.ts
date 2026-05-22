import { HLS_FILE_CACHE_EDGE_GUARD_SECONDS, HLS_FILE_CACHE_MIN_AHEAD_SECONDS, TRANSCODE_PREBUFFER_DEFAULT_SECONDS } from "./torrent-player-helpers.constants";
import type { PlaybackFileOption, PlayableRatioRange, PlayableTranscodeStart } from "./torrent-player-helpers.types";
import { formatBytes } from "./torrent-player-helpers.text";
import type { PlayerTransmissionAudioTrack, PlayerTransmissionFile, PlayerTransmissionStatusResponse } from "@/lib/media-api";

export function buildPlaybackStreamConfigKey(input: {
  fileIndex: number;
  preferTranscode: boolean;
  audioTrackIndex: number;
  outputResolution: number;
  prebufferSeconds: number;
}): string {
  return [input.fileIndex, input.preferTranscode ? "hls" : "direct", input.audioTrackIndex, input.outputResolution, input.prebufferSeconds].join(":");
}

export function buildPlaybackStreamConfigKeyWithStart(input: {
  fileIndex: number;
  preferTranscode: boolean;
  audioTrackIndex: number;
  outputResolution: number;
  prebufferSeconds: number;
  startSeconds?: number;
}): string {
  const base = buildPlaybackStreamConfigKey(input);
  const startBucket = input.preferTranscode
    ? Math.max(0, Math.floor((Number.isFinite(input.startSeconds) ? input.startSeconds || 0 : 0) * 10))
    : 0;
  return `${base}:${startBucket}`;
}

export function hlsNetworkCacheDisplaySeconds(rawSeconds: number, targetSeconds: number): number {
  const raw = Number.isFinite(rawSeconds) ? Math.max(0, rawSeconds) : 0;
  const target = Number.isFinite(targetSeconds) ? Math.max(0, targetSeconds) : 0;
  return target > 0 ? Math.min(raw, target) : raw;
}

export function estimateTranscodeStartBytes(startSeconds: number, totalDurationSeconds: number, totalFileBytes: number): number {
  if (!Number.isFinite(startSeconds) || startSeconds <= 0) return 0;
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) return 0;
  if (!Number.isFinite(totalFileBytes) || totalFileBytes <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, startSeconds / totalDurationSeconds));
  const estimated = Math.floor(ratio * totalFileBytes);
  if (!Number.isFinite(estimated) || estimated <= 0) return 0;
  return Math.max(0, Math.min(totalFileBytes - 1, estimated));
}

export function normalizePlayableRanges(status?: PlayerTransmissionStatusResponse | null): PlayableRatioRange[] {
  if (!status) return [];
  if ((status.selectedFileReadyRatio || 0) >= 0.999) {
    return [{ start: 0, end: 1 }];
  }

  const ranges: PlayableRatioRange[] = [];
  const contiguousEnd = Math.max(0, Math.min(1, Number(status.selectedFileContiguousRatio || 0)));
  if (contiguousEnd > 0) {
    ranges.push({ start: 0, end: contiguousEnd });
  }
  const raw = Array.isArray(status.selectedFileAvailableRanges) ? status.selectedFileAvailableRanges : [];
  for (const item of raw) {
    const start = Math.max(0, Math.min(1, Number(item?.startRatio ?? 0)));
    const end = Math.max(0, Math.min(1, Number(item?.endRatio ?? 0)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    ranges.push({ start, end });
  }

  ranges.sort((a, b) => (a.start === b.start ? a.end - b.end : a.start - b.start));
  const merged: PlayableRatioRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 1e-6) {
      merged.push({ ...range });
      continue;
    }
    if (range.end > last.end) {
      last.end = range.end;
    }
  }
  return merged;
}

export function resolvePlayableTranscodeStart(input: {
  targetSeconds: number;
  totalDurationSeconds: number;
  totalFileBytes: number;
  status?: PlayerTransmissionStatusResponse | null;
  prebufferSeconds: number;
}): PlayableTranscodeStart {
  const timeline = Math.max(0, Number(input.totalDurationSeconds || 0));
  const fileBytes = Math.max(0, Number(input.totalFileBytes || 0));
  const originalSeconds = Math.max(0, Number.isFinite(input.targetSeconds) ? input.targetSeconds : 0);
  const clampedSeconds = timeline > 0 ? Math.min(timeline, originalSeconds) : originalSeconds;
  const rawStartBytes = estimateTranscodeStartBytes(clampedSeconds, timeline, fileBytes);
  const configuredPrebufferSeconds = Math.max(10, Number.isFinite(input.prebufferSeconds) ? Math.floor(input.prebufferSeconds) : TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
  const baseResult = {
    prebufferSeconds: configuredPrebufferSeconds,
    availableAheadSeconds: timeline > 0 ? Math.max(0, timeline - clampedSeconds) : 0
  };

  if (!input.status) {
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      ...baseResult,
      adjusted: false,
      originalSeconds,
      reason: "no_status"
    };
  }
  if ((input.status.selectedFileReadyRatio || 0) >= 0.999) {
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      ...baseResult,
      adjusted: false,
      originalSeconds,
      reason: "complete",
      range: { start: 0, end: 1 }
    };
  }
  if (timeline <= 0 || fileBytes <= 0) {
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      ...baseResult,
      adjusted: false,
      originalSeconds,
      reason: "no_timeline"
    };
  }

  const ranges = normalizePlayableRanges(input.status);
  if (ranges.length === 0) {
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      ...baseResult,
      adjusted: false,
      originalSeconds,
      reason: "no_status"
    };
  }

  const targetRatio = Math.max(0, Math.min(1, clampedSeconds / timeline));
  const guardSeconds = Math.min(HLS_FILE_CACHE_EDGE_GUARD_SECONDS, Math.max(0, timeline - clampedSeconds));
  const guardRatio = timeline > 0 ? guardSeconds / timeline : 0;
  const minAheadSeconds = Math.min(Math.max(HLS_FILE_CACHE_MIN_AHEAD_SECONDS, Math.min(input.prebufferSeconds || 0, 12)), Math.max(1, timeline));
  const minAheadRatio = Math.min(1, minAheadSeconds / timeline);
  const toSeconds = (ratio: number) => Math.max(0, Math.min(timeline, ratio * timeline));
  const hasEnoughAhead = (range: PlayableRatioRange, ratio: number) =>
    range.end >= 0.999 || range.end - ratio >= Math.min(minAheadRatio, Math.max(0, 1 - ratio));

  const containing = ranges.find((range) => targetRatio >= range.start && targetRatio <= range.end);
  if (containing && hasEnoughAhead(containing, targetRatio)) {
    const availableAheadSeconds = Math.max(0, toSeconds(containing.end) - clampedSeconds);
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      prebufferSeconds: Math.max(10, Math.min(configuredPrebufferSeconds, Math.floor(availableAheadSeconds))),
      availableAheadSeconds,
      adjusted: false,
      originalSeconds,
      reason: "inside_range",
      range: containing
    };
  }
  if (containing) {
    const availableAheadSeconds = Math.max(0, toSeconds(containing.end) - clampedSeconds);
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      prebufferSeconds: Math.max(10, Math.min(configuredPrebufferSeconds, Math.floor(availableAheadSeconds))),
      availableAheadSeconds,
      adjusted: false,
      originalSeconds,
      reason: "near_range_end",
      range: containing
    };
  }

  type Candidate = {
    ratio: number;
    range: PlayableRatioRange;
    score: number;
    reason: PlayableTranscodeStart["reason"];
  };
  const candidates: Candidate[] = [];
  for (const range of ranges) {
    const rangeStart = Math.min(range.end, range.start + guardRatio);
    const rangeEnd = Math.max(range.start, range.end - guardRatio);
    const enoughAheadRatio = Math.min(minAheadRatio, Math.max(0, range.end - range.start));
    const latestUsefulStart = Math.max(range.start, range.end - enoughAheadRatio);
    const ratio = targetRatio < range.start ? rangeStart : targetRatio > range.end ? rangeStart : Math.min(targetRatio, latestUsefulStart, rangeEnd);
    const safeRatio = Math.max(range.start, Math.min(range.end, ratio));
    const ahead = range.end - safeRatio;
    if (ahead <= 0 && range.end < 0.999) continue;
    const enoughPenalty = hasEnoughAhead(range, safeRatio) ? 0 : 2;
    candidates.push({
      ratio: safeRatio,
      range,
      score: Math.abs(safeRatio - targetRatio) + enoughPenalty,
      reason: targetRatio >= range.start && targetRatio <= range.end ? "near_range_end" : "outside_cached_range"
    });
  }

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) {
    return {
      seconds: clampedSeconds,
      startBytes: rawStartBytes,
      ...baseResult,
      adjusted: false,
      originalSeconds,
      reason: "no_status"
    };
  }

  const seconds = toSeconds(best.ratio);
  const availableAheadSeconds = Math.max(0, toSeconds(best.range.end) - seconds);
  return {
    seconds,
    startBytes: estimateTranscodeStartBytes(seconds, timeline, fileBytes),
    prebufferSeconds: Math.max(10, Math.min(configuredPrebufferSeconds, Math.floor(availableAheadSeconds))),
    availableAheadSeconds,
    adjusted: Math.abs(seconds - clampedSeconds) >= 0.25,
    originalSeconds,
    reason: best.reason,
    range: best.range
  };
}

export function parseHmsDurationToSeconds(raw: string): number {
  const normalized = raw.trim();
  if (!normalized.includes(":")) return 0;
  const parts = normalized.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

export function parseRuntimeValueSeconds(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    if (raw > 1000) return raw;
    return raw * 60;
  }

  if (Array.isArray(raw)) {
    const values = raw.map((item) => parseRuntimeValueSeconds(item)).filter((value) => value > 0);
    return values.length > 0 ? Math.max(...values) : 0;
  }

  const text = String(raw).trim();
  if (!text) return 0;

  const hms = parseHmsDurationToSeconds(text);
  if (hms > 0) return hms;

  const cleaned = text.replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed > 1000) return parsed;
  return parsed * 60;
}

export function resolveRuntimeSecondsFromLookup(item: {
  content?: {
    runtime?: number | null;
    attributes?: Array<{ key?: string | null; value?: unknown }> | null;
  } | null;
}): number {
  const runtimeMinutes = item.content?.runtime;
  if (typeof runtimeMinutes === "number" && Number.isFinite(runtimeMinutes) && runtimeMinutes > 0) {
    return runtimeMinutes * 60;
  }

  const attributes = Array.isArray(item.content?.attributes) ? item.content?.attributes : [];
  const durationHints = ["runtime", "duration", "run_time", "episode_runtime", "episode_run_time"];
  let maxSeconds = 0;
  for (const entry of attributes) {
    const key = String(entry?.key || "").trim().toLowerCase();
    if (!key) continue;
    if (!durationHints.some((hint) => key.includes(hint))) continue;
    maxSeconds = Math.max(maxSeconds, parseRuntimeValueSeconds(entry?.value));
  }
  return maxSeconds;
}

export function shouldPreferTranscodeForPlayback(
  file: PlaybackFileOption | null,
  status: PlayerTransmissionStatusResponse | null,
  outputResolution: number,
  selectedAudioTrackId: string,
  serverAudioTracks: PlayerTransmissionAudioTrack[]
): boolean {
  if (!file) return true;
  void status;
  void outputResolution;
  void selectedAudioTrackId;
  void serverAudioTracks;
  return true;
}

export function detectResolutionLabel(name: string): string {
  const source = String(name || "");
  const lowered = source.toLowerCase();
  if (/\b(8k|4320p?)\b/.test(lowered)) return "4320p";
  if (/\b(4k|2160p?)\b/.test(lowered)) return "2160p";
  const direct = lowered.match(/\b([3-9]\d{2,3})p\b/);
  if (direct?.[1]) return `${direct[1]}p`;
  const alt = lowered.match(/\b(360|480|540|576|720|1080|1440|2160|4320)\b/);
  if (alt?.[1]) return `${alt[1]}p`;
  return "SOURCE";
}

export function resolutionScore(label: string): number {
  const parsed = Number(label.toLowerCase().replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseResolutionValue(label?: string | null): number {
  const parsed = Number(String(label || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildPlaybackFileOptions(files: PlayerTransmissionFile[]): PlaybackFileOption[] {
  const options = files
    .filter((file) => file.isVideo)
    .map((file) => {
      const resolution = detectResolutionLabel(file.name);
      return {
        value: String(file.index),
        index: file.index,
        name: file.name,
        label: `${resolution} · ${file.name} (${formatBytes(file.length)})`,
        resolutionLabel: resolution,
        length: file.length
      };
    })
    .sort((a, b) => {
      const scoreDiff = resolutionScore(b.resolutionLabel) - resolutionScore(a.resolutionLabel);
      if (scoreDiff !== 0) return scoreDiff;
      return b.length - a.length;
    });
  return options;
}

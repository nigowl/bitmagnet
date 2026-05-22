import type { PlayerStatus, NativeAudioTrack, NativeAudioTrackList, SubtitleCue, VideoWithAudioTracks } from "./torrent-player-helpers.types";

export function normalizeLookupAttributeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeLookupAttributeText(item);
      if (normalized) return normalized;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const title = normalizeLookupAttributeText(record.title);
    if (title) return title;
    const name = normalizeLookupAttributeText(record.name);
    if (name) return name;
    const nested = normalizeLookupAttributeText(record.value);
    if (nested) return nested;
  }
  return "";
}

export function findLookupAttributeValue(
  attributes: Array<{ source?: string | null; key?: string | null; value?: unknown }>,
  keys: string[]
): string {
  const normalizedKeys = new Set(keys.map((item) => item.trim().toLowerCase()).filter(Boolean));
  for (const attr of attributes) {
    const key = String(attr?.key || "").trim().toLowerCase();
    if (!key || !normalizedKeys.has(key)) continue;
    const text = normalizeLookupAttributeText(attr?.value);
    if (text) return text;
  }
  return "";
}

export function containsCJK(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export function containsLatin(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

export function resolveMediaTitlesFromLookup(item: {
  content?: {
    title?: string | null;
    attributes?: Array<{ source?: string | null; key?: string | null; value?: unknown }> | null;
  } | null;
}): { primary: string; zh: string; en: string } {
  const primary = String(item.content?.title || "").trim();
  const attributes = Array.isArray(item.content?.attributes) ? item.content.attributes : [];

  let zh = findLookupAttributeValue(attributes, ["title_zh", "chinese_title", "zh_title", "name_zh", "title_cn", "cn_title"]);
  let en = findLookupAttributeValue(attributes, ["title_en", "english_title", "en_title", "name_en", "original_title", "original_name", "sub_title"]);

  if (primary) {
    if (!zh && containsCJK(primary)) zh = primary;
    if (!en && containsLatin(primary) && !containsCJK(primary)) en = primary;
  }

  if (!zh && !en && primary) {
    if (containsCJK(primary)) zh = primary;
    else en = primary;
  }

  if (zh && en && zh.trim().toLowerCase() === en.trim().toLowerCase()) {
    en = "";
  }

  return { primary, zh, en };
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }
  return fallback;
}

export function normalizePlayerErrorMessage(message: string, t: (key: string) => string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("player disabled")) {
    return t("media.player.disabled");
  }
  return message;
}

export function stringifyDetails(details: unknown): string | undefined {
  if (details === undefined) return undefined;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export function formatBytes(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatClock(totalSecondsInput: number): string {
  const totalSeconds = Number.isFinite(totalSecondsInput) ? Math.max(0, Math.floor(totalSecondsInput)) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSecondsCounter(totalSecondsInput: number): string {
  const totalSeconds = Number.isFinite(totalSecondsInput) ? Math.max(0, Math.floor(totalSecondsInput)) : 0;
  return String(totalSeconds).padStart(2, "0");
}

export function parseVttTimestamp(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((item) => !Number.isFinite(item) || item < 0)) return null;
  if (parts.length === 2) {
    return nums[0]! * 60 + nums[1]!;
  }
  return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
}

export function formatVttTimestamp(totalSecondsInput: number): string {
  const safe = Number.isFinite(totalSecondsInput) ? Math.max(0, totalSecondsInput) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function ensureWebVtt(content: string): string {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "WEBVTT\n\n";
  if (normalized.startsWith("WEBVTT")) return `${normalized}\n`;
  return `WEBVTT\n\n${normalized}\n`;
}

export function normalizeSubtitleOffsetValue(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 2) / 2;
}

export function formatSubtitleOffsetLabel(raw: number): string {
  const safe = Number.isFinite(raw) ? raw : 0;
  const normalized = Math.abs(safe) < 0.001 ? 0 : safe;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}s`;
}

export function fileExtension(name: string): string {
  const target = String(name || "").trim().toLowerCase();
  if (!target.includes(".")) return "";
  const ext = target.slice(target.lastIndexOf("."));
  return ext.length <= 12 ? ext : "";
}

export function normalizeSubtitleLanguage(language: string): string {
  const trimmed = String(language || "").trim().toLowerCase();
  if (!trimmed) return "und";
  const normalized = trimmed.replace(/[^a-z]/g, "");
  if (!normalized) return "und";
  if (normalized.length <= 3) return normalized;
  return normalized.slice(0, 3);
}

export function decodeSubtitleText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

export function parseWebVttCues(content: string): SubtitleCue[] {
  const normalized = ensureWebVtt(content).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const cues: SubtitleCue[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !(lines[index] || "").trim()) {
      index += 1;
    }
    if (index >= lines.length) break;

    const blockStart = index;
    while (index < lines.length && (lines[index] || "").trim()) {
      index += 1;
    }
    const block = lines.slice(blockStart, index);
    if (block.length === 0) continue;

    let timingLine = block[0] || "";
    let payloadStart = 1;
    if (!timingLine.includes("-->") && block.length >= 2 && (block[1] || "").includes("-->")) {
      timingLine = block[1] || "";
      payloadStart = 2;
    }
    if (!timingLine.includes("-->")) continue;

    const parts = timingLine.split("-->");
    if (parts.length !== 2) continue;

    const startSeconds = parseVttTimestamp((parts[0] || "").trim());
    const endToken = ((parts[1] || "").trim().split(/\s+/)[0] || "").trim();
    const endSeconds = parseVttTimestamp(endToken);
    const text = decodeSubtitleText(block.slice(payloadStart).join("\n"));
    if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds || !text) continue;
    cues.push({ start: startSeconds, end: endSeconds, text });
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function convertSrtToVtt(raw: string): string {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "WEBVTT\n\n";
  if (normalized.startsWith("WEBVTT")) return `${normalized}\n`;

  const lines = normalized.split("\n");
  const output: string[] = ["WEBVTT", ""];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (!line) {
      output.push("");
      continue;
    }
    if (/^\d+$/.test(line) && i + 1 < lines.length && lines[i + 1]!.includes("-->")) {
      continue;
    }
    output.push(line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2"));
  }

  return `${output.join("\n").trim()}\n`;
}

export function parseAssTimestamp(raw: string): string | null {
  const match = raw.trim().replace(",", ".").match(/^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;

  const fraction = String(match[4] || "");
  const ms =
    fraction.length === 1 ? Number(fraction) * 100
      : fraction.length === 2 ? Number(fraction) * 10
        : Number((fraction || "0").slice(0, 3));

  const hh = String(Math.max(0, hour)).padStart(2, "0");
  const mm = String(Math.max(0, minute)).padStart(2, "0");
  const ss = String(Math.max(0, second)).padStart(2, "0");
  const mmm = String(Number.isFinite(ms) ? Math.max(0, ms) : 0).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

export function convertAssToVtt(raw: string): string {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const cues: string[] = ["WEBVTT", ""];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.toLowerCase().startsWith("dialogue:")) continue;

    const payload = line.slice("Dialogue:".length).trim();
    const fields = payload.split(",");
    if (fields.length < 10) continue;

    const start = parseAssTimestamp(fields[1] || "");
    const end = parseAssTimestamp(fields[2] || "");
    if (!start || !end) continue;

    const text = fields
      .slice(9)
      .join(",")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\h/gi, " ")
      .trim();
    if (!text) continue;

    cues.push(`${start} --> ${end}`);
    cues.push(text);
    cues.push("");
  }

  return `${cues.join("\n").trim()}\n`;
}

export function convertSubtitleToVtt(fileName: string, content: string): string {
  const ext = fileExtension(fileName);
  if (ext === ".vtt") return ensureWebVtt(content);
  if (ext === ".srt") return convertSrtToVtt(content);
  if (ext === ".ass" || ext === ".ssa") return convertAssToVtt(content);
  throw new Error("unsupported subtitle format");
}

export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read file failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

export function statusToLabel(status: PlayerStatus, t: (key: string) => string): string {
  if (status === "initializing") return t("media.player.statusInitializing");
  if (status === "buffering") return t("media.player.statusBuffering");
  if (status === "ready") return t("media.player.statusReady");
  if (status === "playing") return t("media.player.statusPlaying");
  if (status === "error") return t("media.player.statusError");
  return t("media.player.statusIdle");
}

export function getNativeAudioTracks(video: HTMLVideoElement | null): NativeAudioTrackList | null {
  if (!video) return null;
  const tracks = (video as VideoWithAudioTracks).audioTracks;
  if (!tracks || typeof tracks.length !== "number" || tracks.length < 0) {
    return null;
  }
  return tracks;
}

export function audioTrackSelectionKey(track: NativeAudioTrack, index: number): string {
  const id = String(track?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }
  return `idx:${index}`;
}

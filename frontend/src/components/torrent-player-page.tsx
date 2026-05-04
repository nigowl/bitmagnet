"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Tooltip
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle, ExternalLink, Maximize2, Minimize2, Minus, Pause, PictureInPicture2, Play, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "@/auth/provider";
import { getAuthToken, graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { buildMediaEntryIdFromContentRef, resolveMediaCategory } from "@/lib/media";
import { useI18n } from "@/languages/provider";
import {
  buildPlayerSubtitleContentURL,
  buildPlayerTransmissionHLSHeartbeatURL,
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionHLSStopURL,
  buildPlayerTransmissionThumbnailURL,
  buildPlayerTransmissionStreamURL,
  createPlayerSubtitle,
  deletePlayerSubtitle,
  fetchMediaDetail,
  fetchPlayerSubtitles,
  fetchPlayerTransmissionAudioTracks,
  fetchPlayerTransmissionBootstrap,
  fetchPlayerTransmissionStatus,
  selectPlayerTransmissionFile,
  updatePlayerSubtitle,
  type PlayerSubtitleItem,
  type PlayerTransmissionAudioTrack,
  type PlayerTransmissionFile,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";

type TorrentLookupResponse = {
  torrentContent: {
    search: {
      items: Array<{
        infoHash: string;
        title: string;
        contentType?: string | null;
        contentSource?: string | null;
        contentId?: string | null;
        seeders?: number | null;
        leechers?: number | null;
        publishedAt?: string | null;
        torrent: {
          name: string;
          size: number;
          filesCount?: number | null;
          tagNames?: string[] | null;
          magnetUri?: string | null;
          sources?: Array<{
            key?: string | null;
            name?: string | null;
          }> | null;
        };
        videoResolution?: string | null;
        videoSource?: string | null;
        content?: {
          title?: string | null;
          runtime?: number | null;
          collections?: Array<{
            type?: string | null;
            name?: string | null;
          }> | null;
          attributes?: Array<{
            source?: string | null;
            key?: string | null;
            value?: unknown;
          }> | null;
        } | null;
      }>;
    };
  };
};

type PlayerStatus = "idle" | "initializing" | "buffering" | "ready" | "playing" | "error";
type DiagnosticLevel = "info" | "warn" | "error";

type DiagnosticEntry = {
  id: string;
  timestamp: number;
  level: DiagnosticLevel;
  step: string;
  message: string;
  detailsText?: string;
};

type TorrentDetailLite = {
  infoHash: string;
  title: string;
  contentType?: string;
  seeders?: number | null;
  leechers?: number | null;
  magnetUri?: string | null;
  mediaTitle?: string;
  mediaTitleZh?: string;
  mediaTitleEn?: string;
  mediaEntryId?: string;
  mediaHref?: string;
  sizeBytes?: number;
  filesCount?: number;
  sourceNames?: string[];
  tagNames?: string[];
  videoResolution?: string;
  videoSource?: string;
  publishedAt?: string;
  runtimeSeconds?: number;
};

type PlayerSubtitleSiteLink = {
  id: string;
  label: string;
  href: string;
};

type PlaybackFileOption = {
  value: string;
  index: number;
  name: string;
  label: string;
  resolutionLabel: string;
  length: number;
};

type PlyrLike = {
  destroy: () => void;
  on: (event: string, handler: (event?: Event) => void) => void;
  toggleCaptions: (enabled?: boolean) => void;
  play?: () => Promise<void>;
  pause?: () => void;
  paused?: boolean;
  playing?: boolean;
  speed?: number;
  pip?: boolean;
  fullscreen?: {
    active: boolean;
    toggle: () => void;
  };
  currentTrack: number;
  media: HTMLVideoElement;
  config: {
    duration?: number | string;
    invertTime?: boolean;
  };
};

type HlsLike = {
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  loadSource: (url: string) => void;
  on: (event: string, handler: (event: string, data?: unknown) => void) => void;
  startLoad?: (startPosition?: number) => void;
  stopLoad?: () => void;
};

function buildPlaybackStreamConfigKey(input: {
  fileIndex: number;
  preferTranscode: boolean;
  audioTrackIndex: number;
  outputResolution: number;
  prebufferSeconds: number;
}): string {
  return [
    input.fileIndex,
    input.preferTranscode ? "hls" : "direct",
    input.audioTrackIndex,
    input.outputResolution,
    input.prebufferSeconds
  ].join(":");
}

function hlsNetworkCacheDisplaySeconds(rawSeconds: number, targetSeconds: number): number {
  const raw = Number.isFinite(rawSeconds) ? Math.max(0, rawSeconds) : 0;
  const target = Number.isFinite(targetSeconds) ? Math.max(0, targetSeconds) : 0;
  return target > 0 ? Math.min(raw, target) : raw;
}

type NativeAudioTrack = {
  id?: string;
  label?: string;
  language?: string;
  kind?: string;
  enabled?: boolean;
};

type NativeAudioTrackList = {
  length: number;
  [index: number]: NativeAudioTrack;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

type VideoWithAudioTracks = HTMLVideoElement & {
  audioTracks?: NativeAudioTrackList;
};

const STATUS_POLL_MS = 2500;
const BOOTSTRAP_RETRY_MS = 1800;
const BOOTSTRAP_MAX_WAIT_MS = 120000;
const PLAYBACK_PROGRESS_KEY_PREFIX = "bitmagnet-player-progress-v1";
const PLAYER_GLOBAL_PREFS_KEY_PREFIX = "bitmagnet-player-global-prefs-v1";
const PLAYER_TRACK_PREFS_KEY_PREFIX = "bitmagnet-player-track-prefs-v1";
const PLAYER_FILE_SELECTION_KEY_PREFIX = "bitmagnet-player-file-selection-v1";
const TRANSCODE_PREBUFFER_DEFAULT_SECONDS = 60;
const STREAM_RETRY_MAX_ATTEMPTS = 5;
const STREAM_RETRY_BASE_DELAY_MS = 700;
const STREAM_RETRY_MAX_DELAY_MS = 5000;
const STREAM_RETRY_DEDUPE_MS = 1200;
const PLAYBACK_STALL_RETRY_MS = 12000;
const PLAYBACK_STALL_GRACE_MS = 5000;
const PLAYBACK_STALL_TICK_MS = 1000;
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.5;
const PLAYBACK_RECOVERY_COOLDOWN_MS = 5000;
const HLS_STARTUP_RECOVERY_GRACE_MS = 30000;
const HLS_ACTIVITY_RECOVERY_GRACE_MS = 15000;
const HLS_HEARTBEAT_INTERVAL_MS = 3000;
const INLINE_CONTROLS_HIDE_MS = 2200;
const INLINE_CONTROLS_KEYBOARD_HIDE_MS = 2600;
const INLINE_CONTROLS_FULLSCREEN_HIDE_MS = 3000;
const PLAYER_STAGE_CLICK_DELAY_MS = 280;
const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const TRANSCODE_PREBUFFER_OPTIONS = [10, 30, 45, 60, 90, 120] as const;
const TRANSCODE_OUTPUT_RESOLUTION_OPTIONS = [0, 480, 720, 1080, 1440, 2160] as const;

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function applySubtitleTemplate(urlTemplate: string, title: string, releaseYear?: number): string | null {
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

type PlaybackProgressRecord = {
  infoHash: string;
  fileIndex: number;
  seconds: number;
  duration: number;
  updatedAt: number;
};

type PlaybackFileSelectionRecord = {
  infoHash: string;
  fileIndex: number;
  updatedAt: number;
};

type SubtitleStylePreset = {
  scale: number;
  textColor: string;
  backgroundColor: string;
  verticalPercent: number;
};

type PlayerGlobalPreferences = {
  playbackRate?: number;
  videoFitMode?: "contain" | "cover" | "fill";
  transcodePrebufferSeconds?: number;
  outputResolution?: number;
  subtitleStyleScale?: number;
  subtitleStyleTextColor?: string;
  subtitleStyleBackgroundColor?: string;
  subtitleStyleVerticalPercent?: number;
};

type PlayerTrackPreferences = {
  selectedSubtitleId?: string;
  selectedAudioTrackId?: string;
};

function buildPlaybackProgressStorageKey(infoHash: string, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYBACK_PROGRESS_KEY_PREFIX}:${viewer}:${infoHash}`;
}

function buildPlayerGlobalPreferencesStorageKey(userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_GLOBAL_PREFS_KEY_PREFIX}:${viewer}`;
}

function buildPlayerTrackPreferencesStorageKey(infoHash: string, fileIndex: number, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_TRACK_PREFS_KEY_PREFIX}:${viewer}:${infoHash}:${fileIndex}`;
}

function buildPlayerFileSelectionStorageKey(infoHash: string, userId?: number): string {
  const viewer = Number.isInteger(userId) && (userId || 0) > 0 ? String(userId) : "guest";
  return `${PLAYER_FILE_SELECTION_KEY_PREFIX}:${viewer}:${infoHash}`;
}

function readPlaybackProgressRecord(infoHash: string, userId?: number): PlaybackProgressRecord | null {
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

function readRememberedPlaybackFileIndex(infoHash: string, userId?: number): number {
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

function writeRememberedPlaybackFileIndex(infoHash: string, userId: number | undefined, fileIndex: number): void {
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

function normalizePlaybackRatePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  const matched = PLAYBACK_RATE_OPTIONS.find((value) => Math.abs(value - raw) < 0.01);
  return matched ?? 1;
}

function normalizePrebufferPreference(raw: number): number {
  if (!Number.isFinite(raw)) return TRANSCODE_PREBUFFER_DEFAULT_SECONDS;
  const rounded = Math.round(raw);
  const matched = TRANSCODE_PREBUFFER_OPTIONS.find((value) => value === rounded);
  return matched ?? TRANSCODE_PREBUFFER_DEFAULT_SECONDS;
}

function normalizeTranscodeOutputResolution(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  const matched = TRANSCODE_OUTPUT_RESOLUTION_OPTIONS.find((value) => value === rounded);
  return matched ?? 0;
}

function normalizeVideoFitModePreference(raw: string | null | undefined): "contain" | "cover" | "fill" {
  if (raw === "cover" || raw === "fill") return raw;
  return "contain";
}

function normalizeSubtitleScalePreference(raw: number): number {
  if (!Number.isFinite(raw)) return 1.15;
  const options = [0.9, 1, 1.15, 1.3, 1.5, 1.7];
  const matched = options.find((value) => Math.abs(value - raw) < 0.01);
  return matched ?? 1.15;
}

function normalizeSubtitleVerticalPercentPreference(raw: number): number {
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

function normalizeLookupAttributeText(value: unknown): string {
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

function findLookupAttributeValue(
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

function containsCJK(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function containsLatin(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

function resolveMediaTitlesFromLookup(item: {
  content?: {
    title?: string | null;
    attributes?: Array<{ source?: string | null; key?: string | null; value?: unknown }> | null;
  } | null;
}): { primary: string; zh: string; en: string } {
  const primary = String(item.content?.title || "").trim();
  const attributes = Array.isArray(item.content?.attributes) ? item.content.attributes : [];

  let zh = findLookupAttributeValue(attributes, [
    "title_zh",
    "chinese_title",
    "zh_title",
    "name_zh",
    "title_cn",
    "cn_title"
  ]);
  let en = findLookupAttributeValue(attributes, [
    "title_en",
    "english_title",
    "en_title",
    "name_en",
    "original_title",
    "original_name",
    "sub_title"
  ]);

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

function toErrorMessage(error: unknown, fallback: string): string {
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

function normalizePlayerErrorMessage(message: string, t: (key: string) => string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("player disabled")) {
    return t("media.player.disabled");
  }
  return message;
}

function stringifyDetails(details: unknown): string | undefined {
  if (details === undefined) return undefined;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function formatBytes(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatClock(totalSecondsInput: number): string {
  const totalSeconds = Number.isFinite(totalSecondsInput) ? Math.max(0, Math.floor(totalSecondsInput)) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSecondsCounter(totalSecondsInput: number): string {
  const totalSeconds = Number.isFinite(totalSecondsInput) ? Math.max(0, Math.floor(totalSecondsInput)) : 0;
  return String(totalSeconds).padStart(2, "0");
}

function parseVttTimestamp(raw: string): number | null {
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

function formatVttTimestamp(totalSecondsInput: number): string {
  const safe = Number.isFinite(totalSecondsInput) ? Math.max(0, totalSecondsInput) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function shiftWebVttByOffset(content: string, offsetSeconds: number): string {
  if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) < 0.001) {
    return ensureWebVtt(content);
  }
  const normalized = ensureWebVtt(content).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const output: string[] = [];
  let index = 0;

  if ((lines[0] || "").trimStart().startsWith("WEBVTT")) {
    output.push(lines[0] || "WEBVTT");
    index = 1;
    while (index < lines.length) {
      const line = lines[index] || "";
      output.push(line);
      index += 1;
      if (!line.trim()) {
        break;
      }
    }
  }

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

    let cueId = "";
    let timingLine = block[0] || "";
    let payloadStart = 1;
    if (!timingLine.includes("-->") && block.length >= 2 && (block[1] || "").includes("-->")) {
      cueId = timingLine;
      timingLine = block[1] || "";
      payloadStart = 2;
    }
    if (!timingLine.includes("-->")) {
      output.push(...block, "");
      continue;
    }

    const parts = timingLine.split("-->");
    if (parts.length !== 2) {
      output.push(...block, "");
      continue;
    }

    const startToken = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();
    const rightParts = right.split(/\s+/);
    const endToken = rightParts[0] || "";
    const settingsTail = right.slice(endToken.length);

    const startSeconds = parseVttTimestamp(startToken);
    const endSeconds = parseVttTimestamp(endToken);
    if (startSeconds === null || endSeconds === null) {
      output.push(...block, "");
      continue;
    }

    const shiftedStart = startSeconds - offsetSeconds;
    const shiftedEnd = endSeconds - offsetSeconds;
    if (shiftedEnd <= 0.001) {
      continue;
    }

    const nextStart = Math.max(0, shiftedStart);
    const nextEnd = Math.max(nextStart + 0.001, shiftedEnd);
    if (cueId) output.push(cueId);
    output.push(`${formatVttTimestamp(nextStart)} --> ${formatVttTimestamp(nextEnd)}${settingsTail}`);
    output.push(...block.slice(payloadStart));
    output.push("");
  }

  return `${output.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function normalizeSubtitleOffsetValue(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 2) / 2;
}

function formatSubtitleOffsetLabel(raw: number): string {
  const safe = Number.isFinite(raw) ? raw : 0;
  const normalized = Math.abs(safe) < 0.001 ? 0 : safe;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}s`;
}

function estimateTranscodeStartBytes(
  startSeconds: number,
  totalDurationSeconds: number,
  totalFileBytes: number
): number {
  if (!Number.isFinite(startSeconds) || startSeconds <= 0) return 0;
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) return 0;
  if (!Number.isFinite(totalFileBytes) || totalFileBytes <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, startSeconds / totalDurationSeconds));
  const estimated = Math.floor(ratio * totalFileBytes);
  if (!Number.isFinite(estimated) || estimated <= 0) return 0;
  return Math.max(0, Math.min(totalFileBytes - 1, estimated));
}

function parseHmsDurationToSeconds(raw: string): number {
  const normalized = raw.trim();
  if (!normalized.includes(":")) return 0;
  const parts = normalized.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

function parseRuntimeValueSeconds(raw: unknown): number {
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

function resolveRuntimeSecondsFromLookup(item: {
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

function fileExtension(name: string): string {
  const target = String(name || "").trim().toLowerCase();
  if (!target.includes(".")) return "";
  const ext = target.slice(target.lastIndexOf("."));
  return ext.length <= 12 ? ext : "";
}

function shouldPreferTranscodeForPlayback(
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

function detectResolutionLabel(name: string): string {
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

function resolutionScore(label: string): number {
  const parsed = Number(label.toLowerCase().replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseResolutionValue(label?: string | null): number {
  const parsed = Number(String(label || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildPlaybackFileOptions(files: PlayerTransmissionFile[]): PlaybackFileOption[] {
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

function normalizeSubtitleLanguage(language: string): string {
  const trimmed = String(language || "").trim().toLowerCase();
  if (!trimmed) return "und";
  const normalized = trimmed.replace(/[^a-z]/g, "");
  if (!normalized) return "und";
  if (normalized.length <= 3) return normalized;
  return normalized.slice(0, 3);
}

function ensureWebVtt(content: string): string {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "WEBVTT\n\n";
  if (normalized.startsWith("WEBVTT")) return `${normalized}\n`;
  return `WEBVTT\n\n${normalized}\n`;
}

function convertSrtToVtt(raw: string): string {
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

function parseAssTimestamp(raw: string): string | null {
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

function convertAssToVtt(raw: string): string {
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

function convertSubtitleToVtt(fileName: string, content: string): string {
  const ext = fileExtension(fileName);
  if (ext === ".vtt") return ensureWebVtt(content);
  if (ext === ".srt") return convertSrtToVtt(content);
  if (ext === ".ass" || ext === ".ssa") return convertAssToVtt(content);
  throw new Error("unsupported subtitle format");
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read file failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

function statusToLabel(status: PlayerStatus, t: (key: string) => string): string {
  if (status === "initializing") return t("media.player.statusInitializing");
  if (status === "buffering") return t("media.player.statusBuffering");
  if (status === "ready") return t("media.player.statusReady");
  if (status === "playing") return t("media.player.statusPlaying");
  if (status === "error") return t("media.player.statusError");
  return t("media.player.statusIdle");
}

function getNativeAudioTracks(video: HTMLVideoElement | null): NativeAudioTrackList | null {
  if (!video) return null;
  const tracks = (video as VideoWithAudioTracks).audioTracks;
  if (!tracks || typeof tracks.length !== "number" || tracks.length < 0) {
    return null;
  }
  return tracks;
}

function audioTrackSelectionKey(track: NativeAudioTrack, index: number): string {
  const id = String(track?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }
  return `idx:${index}`;
}

export function TorrentPlayerPage({ infoHash: routeInfoHash }: { infoHash: string }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const infoHash = routeInfoHash.trim().toLowerCase();
  const requestedFileIndex = useMemo(() => {
    const raw = searchParams.get("fileIndex");
    if (!raw) return -1;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return -1;
    return parsed;
  }, [searchParams]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerStageRef = useRef<HTMLDivElement | null>(null);
  const inlineSettingsRef = useRef<HTMLDivElement | null>(null);
  const plyrRef = useRef<PlyrLike | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const statusPollInFlightRef = useRef(false);
  const transcodeSeekInFlightRef = useRef(false);
  const pendingTranscodeSeekDisplayRef = useRef<{ target: number; at: number } | null>(null);
  const isSeekingDragRef = useRef(false);
  const subtitleBlobUrlsRef = useRef<string[]>([]);
  const initializedInfoHashRef = useRef("");
  const subtitleLoadTokenRef = useRef(0);
  const audioTrackLoadTokenRef = useRef(0);
  const hlsRef = useRef<HlsLike | null>(null);
  const hlsStartupAtRef = useRef(0);
  const hlsLastActivityAtRef = useRef(0);
  const hlsLastFragmentBufferedAtRef = useRef(0);
  const hlsSuspendedRef = useRef(false);
  const hlsReleasedForPauseRef = useRef(false);
  const userPausedRef = useRef(false);
  const activeStreamConfigKeyRef = useRef("");
  const selectedFileIndexRef = useRef(-1);
  const fileSwitchingRef = useRef(false);
  const streamUrlRef = useRef("");
  const streamRetryRef = useRef<{ key: string; attempts: number }>({ key: "", attempts: 0 });
  const streamRetryTimerRef = useRef<number | null>(null);
  const lastStreamRetryAtRef = useRef(0);
  const retryCurrentStreamRef = useRef<(reason: string) => boolean>(() => false);
  const releaseCurrentHLSRef = useRef<(reason: string, keepalive?: boolean) => void>(() => {});
  const controlsHideTimerRef = useRef<number | null>(null);
  const stageClickTimerRef = useRef<number | null>(null);
  const streamApplyOptionsRef = useRef<{ resumeAt?: number; autoplay?: boolean; recovery?: boolean }>({});
  const activePreferTranscodeRef = useRef(false);
  const statusSnapshotRef = useRef<PlayerTransmissionStatusResponse | null>(null);
  const totalDurationSecondsRef = useRef(0);
  const transcodeStartOffsetRef = useRef(0);
  const absoluteCurrentSecondsRef = useRef(0);
  const lastPlaybackProgressRef = useRef<{ at: number; seconds: number }>({ at: 0, seconds: 0 });
  const stallStartedAtRef = useRef(0);
  const lastAutoRecoveryAtRef = useRef(0);
  const seekingSwitchingRef = useRef(false);
  const subtitleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAudioTrackQueryIndexRef = useRef(-1);
  const tRef = useRef(t);
  const logWarnRef = useRef<(step: string, message: string, details?: unknown) => void>(() => { });
  const bootstrapRunTokenRef = useRef(0);
  const pendingResumeTargetRef = useRef<number | null>(null);
  const autoResumeWhenPlayableRef = useRef(false);
  const globalPreferencesHydratedRef = useRef(false);
  const trackPreferencesHydratedKeyRef = useRef("");
  const pendingRequestedFileIndexRef = useRef<number | null>(null);
  const revealControlsTimerRef = useRef<number | null>(null);

  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [fileSwitching, setFileSwitching] = useState(false);
  const [subtitleLoading, setSubtitleLoading] = useState(false);

  const [detail, setDetail] = useState<TorrentDetailLite | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [absoluteCurrentSeconds, setAbsoluteCurrentSeconds] = useState(0);
  const [videoAspectRatioCss, setVideoAspectRatioCss] = useState("16 / 9");
  const [videoAspectRatioValue, setVideoAspectRatioValue] = useState(16 / 9);
  const [videoSourceHeight, setVideoSourceHeight] = useState(0);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsActive, setControlsActive] = useState(true);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [isSeekingDrag, setIsSeekingDrag] = useState(false);
  const [seekDraftSeconds, setSeekDraftSeconds] = useState<number | null>(null);
  const [seekHoverSeconds, setSeekHoverSeconds] = useState<number | null>(null);
  const [seekHoverRatio, setSeekHoverRatio] = useState(0);
  const [seekPreviewFailedKey, setSeekPreviewFailedKey] = useState("");
  const [seekPreviewLoadedKey, setSeekPreviewLoadedKey] = useState("");
  const [videoFitMode, setVideoFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [transcodeStartOffsetSeconds, setTranscodeStartOffsetSeconds] = useState(0);
  const [statusSnapshot, setStatusSnapshot] = useState<PlayerTransmissionStatusResponse | null>(null);
  const [fileOptions, setFileOptions] = useState<PlaybackFileOption[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);
  const [transcodeOutputResolution, setTranscodeOutputResolution] = useState(0);

  const [subtitleItems, setSubtitleItems] = useState<PlayerSubtitleItem[]>([]);
  const [subtitleSiteLinks, setSubtitleSiteLinks] = useState<PlayerSubtitleSiteLink[]>([]);
  const [subtitleTrackSrcMap, setSubtitleTrackSrcMap] = useState<Record<number, string>>({});
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("none");
  const [audioTrackOptions, setAudioTrackOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState("");
  const [audioTrackSelectionAvailable, setAudioTrackSelectionAvailable] = useState(false);
  const [serverAudioTracks, setServerAudioTracks] = useState<PlayerTransmissionAudioTrack[]>([]);
  const [subtitleStylePreset, setSubtitleStylePreset] = useState<SubtitleStylePreset>({
    scale: 1.15,
    textColor: "#f6f9ff",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    verticalPercent: 0
  });
  const [subtitleManagerOpened, setSubtitleManagerOpened] = useState(false);
  const [subtitleManagerTab, setSubtitleManagerTab] = useState<string | null>("files");
  const [diagnosticsOpened, setDiagnosticsOpened] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const playbackLoadingRef = useRef(false);
  const playerStatusRef = useRef<PlayerStatus>("idle");
  const [transcodePrebufferSeconds, setTranscodePrebufferSeconds] = useState(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
  const [prebufferProgressSeconds, setPrebufferProgressSeconds] = useState(0);
  const [networkCacheSeconds, setNetworkCacheSeconds] = useState(0);
  const [playableCacheAheadSeconds, setPlayableCacheAheadSeconds] = useState(0);

  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [resumePromptOpened, setResumePromptOpened] = useState(false);
  const [resumePromptSeconds, setResumePromptSeconds] = useState(0);
  const [resumePromptFileIndex, setResumePromptFileIndex] = useState(-1);

  const applyFileOptions = useCallback((nextOptions: PlaybackFileOption[]) => {
    setFileOptions((current) => {
      const currentSignature = current.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      const nextSignature = nextOptions.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      return currentSignature === nextSignature ? current : nextOptions;
    });
  }, []);

  const pushDiagnostic = useCallback((level: DiagnosticLevel, step: string, message: string, details?: unknown) => {
    const now = Date.now();
    const detailsText = stringifyDetails(details);
    setDiagnostics((current) => {
      const next: DiagnosticEntry[] = [
        ...current,
        {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          level,
          step,
          message,
          detailsText
        }
      ];
      return next.slice(-160);
    });
  }, []);

  const logInfo = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("info", step, message, details);
  }, [pushDiagnostic]);

  const logWarn = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("warn", step, message, details);
  }, [pushDiagnostic]);

  const logError = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("error", step, message, details);
  }, [pushDiagnostic]);

  useEffect(() => {
    selectedFileIndexRef.current = selectedFileIndex;
  }, [selectedFileIndex]);

  useEffect(() => {
    pendingRequestedFileIndexRef.current = requestedFileIndex >= 0 ? requestedFileIndex : null;
  }, [infoHash, requestedFileIndex]);

  useEffect(() => {
    isSeekingDragRef.current = isSeekingDrag;
  }, [isSeekingDrag]);

  useEffect(() => {
    absoluteCurrentSecondsRef.current = absoluteCurrentSeconds;
  }, [absoluteCurrentSeconds]);

  useEffect(() => {
    return () => {
      if (streamRetryTimerRef.current !== null) {
        window.clearTimeout(streamRetryTimerRef.current);
        streamRetryTimerRef.current = null;
      }
      if (controlsHideTimerRef.current !== null) {
        window.clearTimeout(controlsHideTimerRef.current);
        controlsHideTimerRef.current = null;
      }
      if (revealControlsTimerRef.current !== null) {
        window.clearTimeout(revealControlsTimerRef.current);
        revealControlsTimerRef.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
      for (const entry of subtitleBlobUrlsRef.current) {
        if (entry.startsWith("blob:")) {
          URL.revokeObjectURL(entry);
        }
      }
      subtitleBlobUrlsRef.current = [];
      initializedInfoHashRef.current = "";
      subtitleLoadTokenRef.current += 1;
      bootstrapRunTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    subtitleLoadTokenRef.current += 1;
    audioTrackLoadTokenRef.current += 1;
    streamRetryRef.current = { key: "", attempts: 0 };
    lastStreamRetryAtRef.current = 0;
    lastAutoRecoveryAtRef.current = 0;
    stallStartedAtRef.current = 0;
    lastPlaybackProgressRef.current = { at: 0, seconds: 0 };
    setSubtitleItems([]);
    setSubtitleTrackSrcMap({});
    setSelectedSubtitleId("none");
    setServerAudioTracks([]);
    setAudioTrackOptions([]);
    setAudioTrackSelectionAvailable(false);
    setSelectedAudioTrackId("");
  }, [infoHash]);

  useEffect(() => {
    setVideoSourceHeight(0);
  }, [infoHash, selectedFileIndex]);

  useEffect(() => {
    globalPreferencesHydratedRef.current = false;
    const key = buildPlayerGlobalPreferencesStorageKey(user?.id);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerGlobalPreferences;
        setVideoPlaybackRate(normalizePlaybackRatePreference(Number(parsed?.playbackRate ?? 1)));
        setVideoFitMode(normalizeVideoFitModePreference(parsed?.videoFitMode));
        setTranscodePrebufferSeconds(normalizePrebufferPreference(Number(parsed?.transcodePrebufferSeconds ?? TRANSCODE_PREBUFFER_DEFAULT_SECONDS)));
        setTranscodeOutputResolution(normalizeTranscodeOutputResolution(Number(parsed?.outputResolution ?? 0)));
        setSubtitleStylePreset({
          scale: normalizeSubtitleScalePreference(Number(parsed?.subtitleStyleScale ?? 1.15)),
          textColor: typeof parsed?.subtitleStyleTextColor === "string" && parsed.subtitleStyleTextColor.trim()
            ? parsed.subtitleStyleTextColor
            : "#f6f9ff",
          backgroundColor: typeof parsed?.subtitleStyleBackgroundColor === "string" && parsed.subtitleStyleBackgroundColor.trim()
            ? parsed.subtitleStyleBackgroundColor
            : "rgba(0, 0, 0, 0.55)",
          verticalPercent: normalizeSubtitleVerticalPercentPreference(Number(parsed?.subtitleStyleVerticalPercent ?? 0))
        });
      } else {
        setVideoPlaybackRate(1);
        setVideoFitMode("contain");
        setTranscodePrebufferSeconds(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
        setTranscodeOutputResolution(0);
        setSubtitleStylePreset({
          scale: 1.15,
          textColor: "#f6f9ff",
          backgroundColor: "rgba(0, 0, 0, 0.55)",
          verticalPercent: 0
        });
      }
    } catch {
      setVideoPlaybackRate(1);
      setVideoFitMode("contain");
      setTranscodePrebufferSeconds(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
      setTranscodeOutputResolution(0);
      setSubtitleStylePreset({
        scale: 1.15,
        textColor: "#f6f9ff",
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        verticalPercent: 0
      });
    } finally {
      globalPreferencesHydratedRef.current = true;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!globalPreferencesHydratedRef.current) return;
    const key = buildPlayerGlobalPreferencesStorageKey(user?.id);
    const payload: PlayerGlobalPreferences = {
      playbackRate: normalizePlaybackRatePreference(videoPlaybackRate),
      videoFitMode: normalizeVideoFitModePreference(videoFitMode),
      transcodePrebufferSeconds: normalizePrebufferPreference(transcodePrebufferSeconds),
      outputResolution: normalizeTranscodeOutputResolution(transcodeOutputResolution),
      subtitleStyleScale: normalizeSubtitleScalePreference(subtitleStylePreset.scale),
      subtitleStyleTextColor: subtitleStylePreset.textColor,
      subtitleStyleBackgroundColor: subtitleStylePreset.backgroundColor,
      subtitleStyleVerticalPercent: normalizeSubtitleVerticalPercentPreference(subtitleStylePreset.verticalPercent)
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [subtitleStylePreset.backgroundColor, subtitleStylePreset.scale, subtitleStylePreset.textColor, subtitleStylePreset.verticalPercent, transcodeOutputResolution, transcodePrebufferSeconds, user?.id, videoFitMode, videoPlaybackRate]);

  useEffect(() => {
    trackPreferencesHydratedKeyRef.current = "";
    if (!infoHash || selectedFileIndex < 0) {
      setSelectedSubtitleId("none");
      setSelectedAudioTrackId("");
      return;
    }
    const key = buildPlayerTrackPreferencesStorageKey(infoHash, selectedFileIndex, user?.id);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerTrackPreferences;
        setSelectedSubtitleId(typeof parsed?.selectedSubtitleId === "string" ? parsed.selectedSubtitleId : "none");
        setSelectedAudioTrackId(typeof parsed?.selectedAudioTrackId === "string" ? parsed.selectedAudioTrackId : "");
      } else {
        setSelectedSubtitleId("none");
        setSelectedAudioTrackId("");
      }
    } catch {
      setSelectedSubtitleId("none");
      setSelectedAudioTrackId("");
    } finally {
      trackPreferencesHydratedKeyRef.current = key;
    }
  }, [infoHash, selectedFileIndex, user?.id]);

  useEffect(() => {
    if (!infoHash || selectedFileIndex < 0) return;
    const key = buildPlayerTrackPreferencesStorageKey(infoHash, selectedFileIndex, user?.id);
    if (trackPreferencesHydratedKeyRef.current !== key) return;
    const payload: PlayerTrackPreferences = {
      selectedSubtitleId,
      selectedAudioTrackId
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [infoHash, selectedAudioTrackId, selectedFileIndex, selectedSubtitleId, user?.id]);

  const subtitleTrackOptions = useMemo(
    () => [
      { value: "none", label: t("media.player.subtitleNone") },
      ...subtitleItems.map((item) => ({
        value: String(item.id),
        label: `${item.label || `Subtitle ${item.id}`}${item.language ? ` (${item.language})` : ""}`
      }))
    ],
    [subtitleItems, t]
  );

  const playbackRateOptions = useMemo(() => [...PLAYBACK_RATE_OPTIONS], []);
  const transcodeResolutionOptions = useMemo(
    () => {
      const selectedResolutionLabel = fileOptions.find((item) => item.index === selectedFileIndex)?.resolutionLabel;
      const byLabel = parseResolutionValue(selectedResolutionLabel);
      const byVideo = Number.isFinite(videoSourceHeight) && videoSourceHeight > 0 ? Math.round(videoSourceHeight) : 0;
      const candidates = [byLabel, byVideo].filter((value) => value > 0);
      const detectedSourceResolution = candidates.length > 0 ? Math.min(...candidates) : 0;
      const filteredValues =
        detectedSourceResolution > 0
          ? TRANSCODE_OUTPUT_RESOLUTION_OPTIONS.filter((value) => value <= 0 || value <= detectedSourceResolution)
          : TRANSCODE_OUTPUT_RESOLUTION_OPTIONS;
      return filteredValues.map((value) => ({
        value,
        label: value <= 0 ? t("media.player.resolutionOutputOriginal") : `${value}p`
      }));
    },
    [fileOptions, selectedFileIndex, t, videoSourceHeight]
  );

  useEffect(() => {
    if (transcodeOutputResolution <= 0) return;
    const exists = transcodeResolutionOptions.some((item) => item.value === transcodeOutputResolution);
    if (!exists) {
      setTranscodeOutputResolution(0);
    }
  }, [transcodeOutputResolution, transcodeResolutionOptions]);

  const shouldAutoplayStreamChange = useCallback(() => {
    const video = videoRef.current;
    return Boolean(
      !userPausedRef.current &&
      (
        autoResumeWhenPlayableRef.current ||
        playbackLoadingRef.current ||
        playerStatusRef.current === "buffering" ||
        playerStatusRef.current === "playing" ||
        Boolean(video && !video.paused)
      )
    );
  }, []);

  const handleSetTranscodeOutputResolution = useCallback(
    (nextResolution: number) => {
      if (nextResolution === transcodeOutputResolution) return;
      if (shouldAutoplayStreamChange()) {
        autoResumeWhenPlayableRef.current = true;
        userPausedRef.current = false;
        setIsVideoPaused(false);
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
      }
      setTranscodeOutputResolution(nextResolution);
    },
    [shouldAutoplayStreamChange, transcodeOutputResolution]
  );

  const selectedFileOption = useMemo(
    () => fileOptions.find((item) => item.index === selectedFileIndex) || null,
    [fileOptions, selectedFileIndex]
  );

  const resolvePreferTranscode = useCallback(
    (
      file: PlaybackFileOption | null = selectedFileOption,
      status: PlayerTransmissionStatusResponse | null = statusSnapshotRef.current
    ): boolean =>
      shouldPreferTranscodeForPlayback(
        file,
        status,
        transcodeOutputResolution,
        selectedAudioTrackId,
        serverAudioTracks
      ),
    [selectedAudioTrackId, selectedFileOption, serverAudioTracks, transcodeOutputResolution]
  );

  const selectedAudioTrackQueryIndex = useMemo(() => {
    if (!selectedAudioTrackId.startsWith("srv:")) return -1;
    const parsed = Number(selectedAudioTrackId.slice(4));
    if (!Number.isInteger(parsed) || parsed < 0) return -1;
    return serverAudioTracks.some((track) => track.index === parsed) ? parsed : -1;
  }, [selectedAudioTrackId, serverAudioTracks]);

  const buildTranscodeStreamOptions = useCallback(
    (overrides?: { audioTrackIndex?: number; startSeconds?: number; startBytes?: number; durationSeconds?: number }) => {
      const options: {
        transcode: true;
        audioTrackIndex: number;
        outputResolution?: number;
        startSeconds?: number;
        startBytes?: number;
      } = {
        transcode: true,
        audioTrackIndex:
          Number.isInteger(overrides?.audioTrackIndex) && (overrides?.audioTrackIndex ?? -1) >= -1
            ? Math.max(-1, Number(overrides?.audioTrackIndex))
            : selectedAudioTrackQueryIndex
      };
      if (transcodeOutputResolution > 0) {
        options.outputResolution = transcodeOutputResolution;
      }
      if (Number.isFinite(overrides?.startSeconds) && (overrides?.startSeconds || 0) > 0) {
        options.startSeconds = Math.max(0, overrides?.startSeconds || 0);
      }
      if (Number.isFinite(overrides?.startBytes) && (overrides?.startBytes || 0) > 0) {
        options.startBytes = Math.max(0, Math.floor(overrides?.startBytes || 0));
      }
      return options;
    },
    [selectedAudioTrackQueryIndex, transcodeOutputResolution]
  );

  const buildHLSPlaylistOptions = useCallback(
    (overrides?: { audioTrackIndex?: number; startSeconds?: number; startBytes?: number; durationSeconds?: number }) => {
      const base = buildTranscodeStreamOptions(overrides);
      const durationSeconds = Number.isFinite(overrides?.durationSeconds) && (overrides?.durationSeconds || 0) > 0
        ? Math.max(0, overrides?.durationSeconds || 0)
        : Math.max(0, totalDurationSecondsRef.current);
      return {
        audioTrackIndex: base.audioTrackIndex,
        outputResolution: base.outputResolution,
        startSeconds: base.startSeconds,
        startBytes: base.startBytes,
        prebufferSeconds: transcodePrebufferSeconds,
        durationSeconds
      };
    },
    [buildTranscodeStreamOptions, transcodePrebufferSeconds]
  );

  const activePreferTranscode = useMemo(
    () => (selectedFileOption ? resolvePreferTranscode(selectedFileOption, statusSnapshot) : false),
    [resolvePreferTranscode, selectedFileOption, statusSnapshot]
  );

  const buildCurrentPlaybackStreamURL = useCallback(
    (cacheTag?: string) => {
      if (!infoHash) return "";
      const index = selectedFileIndexRef.current;
      if (!Number.isInteger(index) || index < 0) return "";
      const selected = fileOptions.find((item) => item.index === index);
      if (!selected) return "";
      const preferTranscode = resolvePreferTranscode(selected, statusSnapshotRef.current);
      const mode = preferTranscode ? "transcode" : "direct";
      const nextCacheTag = cacheTag || `${index}-${mode}-${preferTranscode ? "hls" : "direct"}-${Date.now()}`;
      return preferTranscode
        ? buildPlayerTransmissionHLSPlaylistURL(infoHash, index, nextCacheTag, buildHLSPlaylistOptions({ durationSeconds: totalDurationSecondsRef.current }))
        : buildPlayerTransmissionStreamURL(infoHash, index, nextCacheTag);
    },
    [buildHLSPlaylistOptions, fileOptions, infoHash, resolvePreferTranscode]
  );

  const totalDurationSeconds = useMemo(() => {
    const meta = detail?.runtimeSeconds || 0;
    const probed =
      statusSnapshot?.selectedFileIndex === selectedFileIndex
        ? statusSnapshot?.selectedFileDurationSeconds || 0
        : 0;
    const media = Number.isFinite(videoDuration) ? Math.max(0, videoDuration) : 0;
    if (probed > 0) return probed;
    if (media > 0) return media;
    return meta;
  }, [detail?.runtimeSeconds, selectedFileIndex, statusSnapshot?.selectedFileDurationSeconds, statusSnapshot?.selectedFileIndex, videoDuration]);

  const canInitializePlyr =
    !bootstrapLoading &&
    bootstrapped &&
    fileOptions.length > 0 &&
    selectedFileIndex >= 0 &&
    Boolean(selectedFileOption) &&
    Boolean(streamUrl);

  const resolveAbsoluteCurrent = useCallback(() => {
    const video = videoRef.current;
    if (!video) return Math.max(0, absoluteCurrentSecondsRef.current);
    const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
    if (activePreferTranscodeRef.current) {
      return transcodeStartOffsetRef.current + nativeCurrent;
    }
    return nativeCurrent;
  }, []);

  const resolveBufferedAheadAtSeconds = useCallback((secondsInput?: number) => {
    const video = videoRef.current;
    if (!video) return 0;
    const current = Number.isFinite(secondsInput)
      ? Math.max(0, Number(secondsInput))
      : Number.isFinite(video.currentTime)
        ? Math.max(0, video.currentTime)
        : 0;
    const ranges = video.buffered;
    if (!ranges || ranges.length <= 0) return 0;
    for (let idx = 0; idx < ranges.length; idx += 1) {
      const start = ranges.start(idx);
      const end = ranges.end(idx);
      if (current + 0.01 < start || current - 0.25 > end) continue;
      return Math.max(0, end - current);
    }
    return 0;
  }, []);

  const resolveBufferedAheadSeconds = useCallback(() => resolveBufferedAheadAtSeconds(), [resolveBufferedAheadAtSeconds]);

  const resolveHLSNetworkCacheAheadSeconds = useCallback(() => {
    if (!activePreferTranscodeRef.current) return 0;
    return resolveBufferedAheadSeconds();
  }, [resolveBufferedAheadSeconds]);

  const resolveCachedAheadSeconds = useCallback(() => {
    const browserAhead = resolveBufferedAheadSeconds();
    if (activePreferTranscodeRef.current) {
      return browserAhead;
    }
    const status = statusSnapshotRef.current;
    const current = Math.max(0, resolveAbsoluteCurrent());
    const timeline = Math.max(0, totalDurationSecondsRef.current);
    if (!status || timeline <= 0 || status.selectedFileIndex !== selectedFileIndexRef.current) {
      return browserAhead;
    }

    let cachedAhead = 0;
    const ranges = Array.isArray(status.selectedFileAvailableRanges) ? status.selectedFileAvailableRanges : [];
    for (const range of ranges) {
      const start = Math.max(0, Math.min(1, Number(range?.startRatio ?? 0))) * timeline;
      const end = Math.max(0, Math.min(1, Number(range?.endRatio ?? 0))) * timeline;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (current + 0.01 < start || current - 0.25 > end) continue;
      cachedAhead = Math.max(cachedAhead, end - current);
    }

    const contiguousEnd = Math.max(0, Math.min(1, Number(status.selectedFileContiguousRatio || 0))) * timeline;
    if (current <= contiguousEnd + 0.25) {
      cachedAhead = Math.max(cachedAhead, contiguousEnd - current);
    }
    if ((status.selectedFileReadyRatio || 0) >= 0.999) {
      cachedAhead = Math.max(cachedAhead, timeline - current);
    }

    return Math.max(0, browserAhead, cachedAhead);
  }, [resolveAbsoluteCurrent, resolveBufferedAheadSeconds]);

  const settlePausedPlayback = useCallback((status: PlayerStatus = "ready") => {
    autoResumeWhenPlayableRef.current = false;
    pendingResumeTargetRef.current = null;
    setPlaybackLoading(false);
    setPlayerStatus(status);
    setIsVideoPaused(true);
  }, []);

  const attemptResumePlayback = useCallback((reason: string, targetSeconds?: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (userPausedRef.current) {
      settlePausedPlayback();
      return;
    }

    const pendingTarget = Number.isFinite(targetSeconds) ? Math.max(0, Number(targetSeconds)) : resolveAbsoluteCurrent();
    pendingResumeTargetRef.current = pendingTarget;
    autoResumeWhenPlayableRef.current = true;
    setPlaybackLoading(true);
    setPlayerStatus("buffering");

    const player = plyrRef.current;
    const playResult = player?.play ? player.play() : video.play();
    void Promise.resolve(playResult).catch((error) => {
      const errorName = error instanceof DOMException ? error.name : "";
      logInfo("playback", "waiting for playable data", { reason, targetSeconds: pendingTarget, errorName });
      if (errorName === "AbortError") {
        if (video.paused) {
          settlePausedPlayback();
        }
        return;
      }
      if (video.paused && errorName === "NotAllowedError") {
        settlePausedPlayback();
      }
    });
  }, [logInfo, resolveAbsoluteCurrent, settlePausedPlayback]);

  useEffect(() => {
    activePreferTranscodeRef.current = activePreferTranscode;
  }, [activePreferTranscode]);

  useEffect(() => {
    statusSnapshotRef.current = statusSnapshot;
  }, [statusSnapshot]);

  useEffect(() => {
    playerStatusRef.current = playerStatus;
  }, [playerStatus]);

  useEffect(() => {
    playbackLoadingRef.current = playbackLoading;
  }, [playbackLoading]);

  useEffect(() => {
    setVideoDuration(0);
  }, [infoHash, selectedFileIndex]);

  useEffect(() => {
    selectedAudioTrackQueryIndexRef.current = selectedAudioTrackQueryIndex;
  }, [selectedAudioTrackQueryIndex]);

  useEffect(() => {
    streamUrlRef.current = streamUrl;
    setPrebufferProgressSeconds(0);
    setNetworkCacheSeconds(0);
  }, [streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (!streamUrl) {
      video.removeAttribute("src");
      video.load();
      return;
    }
    if (!activePreferTranscode || !streamUrl.includes("/api/media/player/transmission/hls/playlist")) {
      video.src = streamUrl;
      return;
    }
    if (hlsSuspendedRef.current) {
      video.removeAttribute("src");
      video.load();
      return;
    }

    let cancelled = false;
    const applyNativeHLS = () => {
      if (userPausedRef.current || hlsSuspendedRef.current) return;
      video.src = streamUrl;
      video.load();
    };

    void import("hls.js")
      .then((module) => {
        if (cancelled || !videoRef.current || userPausedRef.current || hlsSuspendedRef.current) return;
        const HlsCtor = module.default;
        if (!HlsCtor.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            applyNativeHLS();
          } else {
            setPlayerError(tRef.current("media.player.playbackError"));
            setPlayerStatus("error");
          }
          return;
        }
        const hls = new HlsCtor({
          autoStartLoad: true,
          enableWorker: true,
          lowLatencyMode: false,
          startPosition: 0,
          maxBufferLength: Math.max(30, transcodePrebufferSeconds),
          maxMaxBufferLength: Math.max(60, transcodePrebufferSeconds),
          backBufferLength: 30,
          xhrSetup: (xhr: XMLHttpRequest) => {
            const token = getAuthToken();
            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }
            xhr.withCredentials = true;
          }
        }) as HlsLike;
        hlsRef.current = hls;
        hlsStartupAtRef.current = Date.now();
        hlsLastActivityAtRef.current = hlsStartupAtRef.current;
        hlsLastFragmentBufferedAtRef.current = 0;
        activeStreamConfigKeyRef.current = buildPlaybackStreamConfigKey({
          fileIndex: selectedFileIndexRef.current,
          preferTranscode: true,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds
        });

        const refreshHLSCacheState = () => {
          hlsLastActivityAtRef.current = Date.now();
          const ahead = resolveHLSNetworkCacheAheadSeconds();
          const displayAhead = hlsNetworkCacheDisplaySeconds(ahead, transcodePrebufferSeconds);
          setNetworkCacheSeconds((current) => (Math.abs(current - displayAhead) < 0.25 ? current : displayAhead));
          setPlayableCacheAheadSeconds((current) => (Math.abs(current - ahead) < 0.25 ? current : ahead));
        };
        const startHLSLoad = () => {
          if (cancelled) return;
          if (userPausedRef.current || hlsSuspendedRef.current) return;
          hlsLastActivityAtRef.current = Date.now();
          hls.startLoad?.(0);
          if (Number.isFinite(video.currentTime) && video.currentTime > 0.25) {
            try {
              video.currentTime = 0;
            } catch {
              // keep the browser-selected start if the media element refuses the reset
            }
          }
        };

        hls.on(HlsCtor.Events.MEDIA_ATTACHED, () => {
          if (cancelled) return;
          if (userPausedRef.current || hlsSuspendedRef.current) return;
          hlsLastActivityAtRef.current = Date.now();
          hls.loadSource(streamUrl);
        });
        hls.on(HlsCtor.Events.MANIFEST_PARSED, startHLSLoad);
        hls.on(HlsCtor.Events.LEVEL_LOADED, () => {
          if (cancelled) return;
          refreshHLSCacheState();
        });
        hls.on(HlsCtor.Events.FRAG_BUFFERED, () => {
          hlsLastFragmentBufferedAtRef.current = Date.now();
          refreshHLSCacheState();
        });
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (cancelled) return;
          hlsLastActivityAtRef.current = Date.now();
          const payload = data as { fatal?: boolean; type?: string; details?: string };
          logWarnRef.current("hls", "hls playback error", payload);
          if (!payload?.fatal) return;
          if (userPausedRef.current || hlsSuspendedRef.current || hlsReleasedForPauseRef.current) {
            settlePausedPlayback();
            return;
          }
          if (retryCurrentStreamRef.current("hls_error")) return;
          setPlaybackLoading(false);
          setPlayerStatus("error");
          setPlayerError(tRef.current("media.player.playbackError"));
        });
        hls.attachMedia(video);
      })
      .catch((error) => {
        if (cancelled) return;
        logWarnRef.current("hls", "failed to initialize hls.js", { message: toErrorMessage(error, "hls init failed") });
        applyNativeHLS();
      });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [activePreferTranscode, resolveHLSNetworkCacheAheadSeconds, settlePausedPlayback, streamUrl, transcodeOutputResolution, transcodePrebufferSeconds]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    logWarnRef.current = logWarn;
  }, [logWarn]);

  useEffect(() => {
    totalDurationSecondsRef.current = totalDurationSeconds;
  }, [totalDurationSeconds]);

  useEffect(() => {
    transcodeStartOffsetRef.current = transcodeStartOffsetSeconds;
  }, [transcodeStartOffsetSeconds]);

  useEffect(() => {
    const revokeAll = (list: string[]) => {
      for (const entry of list) {
        if (entry.startsWith("blob:")) {
          URL.revokeObjectURL(entry);
        }
      }
    };

    if (!infoHash || subtitleItems.length === 0) {
      setSubtitleTrackSrcMap({});
      if (subtitleBlobUrlsRef.current.length > 0) {
        revokeAll(subtitleBlobUrlsRef.current);
        subtitleBlobUrlsRef.current = [];
      }
      return;
    }

    const transcodeOffsetSeconds = activePreferTranscode ? Math.max(0, transcodeStartOffsetSeconds) : 0;
    const effectiveOffsetBySubtitleID = new Map<number, number>(
      subtitleItems.map((item) => {
        const manualOffsetSeconds = Number.isFinite(item.offsetSeconds) ? item.offsetSeconds : 0;
        return [item.id, transcodeOffsetSeconds - manualOffsetSeconds];
      })
    );
    const shouldBuildShifted = Array.from(effectiveOffsetBySubtitleID.values()).some((offset) => Math.abs(offset) >= 0.1);
    if (!shouldBuildShifted) {
      const next: Record<number, string> = {};
      for (const item of subtitleItems) {
        next[item.id] = buildPlayerSubtitleContentURL(infoHash, item.id, item.updatedAt);
      }
      setSubtitleTrackSrcMap(next);
      if (subtitleBlobUrlsRef.current.length > 0) {
        revokeAll(subtitleBlobUrlsRef.current);
        subtitleBlobUrlsRef.current = [];
      }
      return;
    }

    let cancelled = false;
    const buildShifted = async () => {
      const next: Record<number, string> = {};
      const nextBlobUrls: string[] = [];

      for (const item of subtitleItems) {
        const baseUrl = buildPlayerSubtitleContentURL(infoHash, item.id, item.updatedAt);
        const effectiveOffsetSeconds = effectiveOffsetBySubtitleID.get(item.id) || 0;
        try {
          const response = await fetch(baseUrl, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`subtitle http ${response.status}`);
          }
          const raw = await response.text();
          const shifted = shiftWebVttByOffset(raw, effectiveOffsetSeconds);
          const blobUrl = URL.createObjectURL(new Blob([shifted], { type: "text/vtt" }));
          next[item.id] = blobUrl;
          nextBlobUrls.push(blobUrl);
        } catch (error) {
          next[item.id] = baseUrl;
          logWarn("subtitle", "failed to build shifted subtitle source", {
            subtitleId: item.id,
            offsetSeconds: effectiveOffsetSeconds,
            message: toErrorMessage(error, "shift subtitle failed")
          });
        }
      }

      if (cancelled) {
        revokeAll(nextBlobUrls);
        return;
      }
      const previous = subtitleBlobUrlsRef.current;
      subtitleBlobUrlsRef.current = nextBlobUrls;
      setSubtitleTrackSrcMap(next);
      revokeAll(previous);
    };

    void buildShifted();
    return () => {
      cancelled = true;
    };
  }, [activePreferTranscode, infoHash, logWarn, subtitleItems, transcodeStartOffsetSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    const player = plyrRef.current;
    const syntheticDuration = Number.isFinite(totalDurationSecondsRef.current)
      ? Math.max(0, totalDurationSecondsRef.current)
      : 0;

    if (player) {
      player.config.duration = syntheticDuration > 0 ? syntheticDuration : undefined;
      const previousInvert = Boolean(player.config.invertTime);
      player.config.invertTime = true;
      player.media.dispatchEvent(new Event("durationchange"));
      player.config.invertTime = previousInvert;
      player.media.dispatchEvent(new Event("timeupdate"));
      return;
    }

    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
  }, [activePreferTranscode, streamUrl, totalDurationSeconds, transcodeStartOffsetSeconds]);

  const syncSelectedSubtitleTrack = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    const wasPaused = video.paused;
    const player = plyrRef.current;
    const selectedIndex =
      selectedSubtitleId === "none" ? -1 : subtitleItems.findIndex((item) => String(item.id) === selectedSubtitleId);

    for (let i = 0; i < video.textTracks.length; i += 1) {
      const track = video.textTracks[i];
      const shouldShow = selectedIndex >= 0 && i === selectedIndex;
      track.mode = shouldShow ? "showing" : "disabled";
    }

    if (player) {
      try {
        if (selectedIndex >= 0 && selectedIndex < video.textTracks.length) {
          player.currentTrack = selectedIndex;
        }
        if (!wasPaused && video.paused && !userPausedRef.current) {
          void video.play().catch(() => {
            // ignore autoplay rejection
          });
        }
        return;
      } catch {
        // fallback to native text track toggling below
      }
    }

    if (!wasPaused && video.paused && !userPausedRef.current) {
      void video.play().catch(() => {
        // ignore autoplay rejection
      });
    }
  }, [selectedSubtitleId, subtitleItems]);

  const loadServerAudioTracks = useCallback(
    async (fileIndex: number) => {
      const runToken = audioTrackLoadTokenRef.current + 1;
      audioTrackLoadTokenRef.current = runToken;
      selectedAudioTrackQueryIndexRef.current = -1;
      setServerAudioTracks([]);
      setAudioTrackOptions([]);
      setAudioTrackSelectionAvailable(false);

      if (!infoHash || !Number.isInteger(fileIndex) || fileIndex < 0) {
        return;
      }
      try {
        const tracks = await fetchPlayerTransmissionAudioTracks(infoHash, fileIndex);
        if (audioTrackLoadTokenRef.current !== runToken || selectedFileIndexRef.current !== fileIndex) {
          return;
        }
        setServerAudioTracks(tracks);
      } catch {
        if (audioTrackLoadTokenRef.current !== runToken || selectedFileIndexRef.current !== fileIndex) {
          return;
        }
        setServerAudioTracks([]);
      }
    },
    [infoHash]
  );

  const refreshAudioTracks = useCallback(() => {
    const tracks = getNativeAudioTracks(videoRef.current);
    if (serverAudioTracks.length > 0) {
      const options: Array<{ value: string; label: string }> = [];
      let defaultValue = "";
      for (const track of serverAudioTracks) {
        const parts = [String(track.label || "").trim()];
        const language = String(track.language || "").trim();
        if (language) {
          parts.push(language.toUpperCase());
        }
        const codec = String(track.codec || "").trim();
        if (codec) {
          parts.push(codec.toUpperCase());
        }
        if (Number.isFinite(track.channels) && track.channels > 0) {
          parts.push(`${track.channels}ch`);
        }
        const value = `srv:${track.index}`;
        options.push({
          value,
          label: parts.filter((item) => item).join(" · ") || `${t("media.player.audioTrackDefault")} ${track.index + 1}`
        });
        if (track.default && !defaultValue) {
          defaultValue = value;
        }
      }
      if (!defaultValue && options[0]) {
        defaultValue = options[0].value;
      }
      setAudioTrackSelectionAvailable(options.length > 0);
      setAudioTrackOptions(options);
      setSelectedAudioTrackId((current) => {
        if (current && options.some((item) => item.value === current)) {
          return current;
        }
        return defaultValue;
      });
      return;
    }

    if (!tracks || tracks.length <= 0) {
      setAudioTrackSelectionAvailable(false);
      setAudioTrackOptions([]);
      return;
    }

    const nextOptions: Array<{ value: string; label: string }> = [];
    let enabledKey = "";
    for (let idx = 0; idx < tracks.length; idx += 1) {
      const track = tracks[idx];
      const key = audioTrackSelectionKey(track, idx);
      const labelParts = [String(track?.label || "").trim()];
      const language = String(track?.language || "").trim();
      if (language) {
        labelParts.push(language.toUpperCase());
      }
      const kind = String(track?.kind || "").trim();
      if (kind) {
        labelParts.push(kind);
      }
      const cleanParts = labelParts.filter((item) => item);
      const label = cleanParts.length > 0 ? cleanParts.join(" · ") : `${t("media.player.audioTrackDefault")} ${idx + 1}`;
      if (track?.enabled && !enabledKey) {
        enabledKey = key;
      }
      nextOptions.push({ value: key, label });
    }
    if (!enabledKey && nextOptions[0]) {
      enabledKey = nextOptions[0].value;
    }

    setAudioTrackSelectionAvailable(nextOptions.length > 0);
    setAudioTrackOptions(nextOptions);
    setSelectedAudioTrackId((current) => {
      if (current && nextOptions.some((item) => item.value === current)) {
        return current;
      }
      return enabledKey;
    });
  }, [serverAudioTracks, t]);

  const syncSelectedAudioTrack = useCallback(() => {
    if (selectedAudioTrackId.startsWith("srv:")) {
      return;
    }
    const tracks = getNativeAudioTracks(videoRef.current);
    if (!tracks || tracks.length <= 0) return;

    let targetIndex = -1;
    if (selectedAudioTrackId) {
      for (let idx = 0; idx < tracks.length; idx += 1) {
        if (audioTrackSelectionKey(tracks[idx], idx) === selectedAudioTrackId) {
          targetIndex = idx;
          break;
        }
      }
    }
    if (targetIndex < 0) {
      for (let idx = 0; idx < tracks.length; idx += 1) {
        if (tracks[idx]?.enabled) {
          targetIndex = idx;
          break;
        }
      }
    }
    if (targetIndex < 0) {
      targetIndex = 0;
    }
    for (let idx = 0; idx < tracks.length; idx += 1) {
      const track = tracks[idx];
      if (!track) continue;
      track.enabled = idx === targetIndex;
    }
  }, [selectedAudioTrackId]);

  const applyStreamUrl = useCallback((url: string, options?: { resumeAt?: number; autoplay?: boolean; recovery?: boolean }) => {
    if (!options?.recovery && streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current);
      streamRetryTimerRef.current = null;
      streamRetryRef.current = { key: "", attempts: 0 };
    }
    const isHLS = url.includes("/api/media/player/transmission/hls/playlist");
    if (isHLS) {
      hlsSuspendedRef.current = !options?.autoplay;
      if (options?.autoplay) {
        hlsReleasedForPauseRef.current = false;
      }
    }
    streamUrlRef.current = url;
    streamApplyOptionsRef.current = options || {};
    if (!options?.autoplay) {
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.autoplay = false;
        video.pause();
      }
      plyrRef.current?.pause?.();
      setIsVideoPaused(true);
      setPlaybackLoading(false);
    }
    setStreamUrl(url);
  }, []);

  const releaseCurrentHLS = useCallback((reason: string, keepalive = false) => {
    const index = selectedFileIndexRef.current;
    if (!infoHash || index < 0 || !activePreferTranscodeRef.current) return;
    const preserveFrame = !keepalive && (reason === "pause" || reason === "manual_pause");

    hlsSuspendedRef.current = true;
    hlsReleasedForPauseRef.current = true;
    const hls = hlsRef.current;
    if (hls) {
      if (preserveFrame) {
        hls.stopLoad?.();
      } else {
        hls.destroy();
        hlsRef.current = null;
      }
    }
    if (!keepalive) {
      setNetworkCacheSeconds(0);
      setPlayableCacheAheadSeconds(0);
    }

    const url = buildPlayerTransmissionHLSStopURL(infoHash, index, {
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution
    });
    const token = getAuthToken();
    void fetch(url, {
      method: "POST",
      credentials: "include",
      keepalive,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }).catch((error) => {
      if (!keepalive) {
        logWarn("hls", "failed to release hls transcode session", {
          reason,
          message: toErrorMessage(error, "release failed")
        });
      }
    });
  }, [infoHash, logWarn, transcodeOutputResolution]);

  useEffect(() => {
    releaseCurrentHLSRef.current = releaseCurrentHLS;
  }, [releaseCurrentHLS]);

  const sendHLSHeartbeat = useCallback((stateOverride?: "playing" | "paused" | "idle", keepalive = false) => {
    const index = selectedFileIndexRef.current;
    if (!infoHash || index < 0 || !activePreferTranscodeRef.current) return;

    const video = videoRef.current;
    const visible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
    const startingOrBuffering = autoResumeWhenPlayableRef.current ||
      playbackLoadingRef.current ||
      playerStatusRef.current === "buffering";
    const playbackActive = Boolean(
      visible &&
      !userPausedRef.current &&
      !hlsSuspendedRef.current &&
      (!video || !video.paused || startingOrBuffering)
    );
    const state = stateOverride || (playbackActive ? "playing" : "paused");
    const url = buildPlayerTransmissionHLSHeartbeatURL(infoHash, index, {
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution
    });
    const token = getAuthToken();
    void fetch(url, {
      method: "POST",
      credentials: "include",
      keepalive,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        state,
        visible,
        currentSeconds: Math.max(0, resolveAbsoluteCurrent())
      })
    }).catch((error) => {
      if (!keepalive) {
        logWarn("hls", "failed to send hls heartbeat", {
          state,
          message: toErrorMessage(error, "heartbeat failed")
        });
      }
    });
  }, [infoHash, logWarn, resolveAbsoluteCurrent, transcodeOutputResolution]);

  useEffect(() => {
    if (!infoHash || selectedFileIndex < 0 || !activePreferTranscode) return;

    const tick = () => sendHLSHeartbeat();
    tick();
    const timer = window.setInterval(tick, HLS_HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      sendHLSHeartbeat("idle", true);
    };
  }, [activePreferTranscode, infoHash, selectedFileIndex, sendHLSHeartbeat]);

  const retryCurrentStream = useCallback((reason: string) => {
    const index = selectedFileIndexRef.current;
    if (!infoHash || !Number.isInteger(index) || index < 0) return false;
    if (userPausedRef.current) {
      settlePausedPlayback();
      return true;
    }
    if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
      settlePausedPlayback();
      return true;
    }

    const now = Date.now();
    const retryKey = `${index}:transcode:${activePreferTranscodeRef.current ? "tc" : "direct"}`;
    if (streamRetryRef.current.key !== retryKey) {
      streamRetryRef.current = { key: retryKey, attempts: 0 };
    }
    if (streamRetryTimerRef.current !== null && now - lastStreamRetryAtRef.current < STREAM_RETRY_DEDUPE_MS) {
      return true;
    }
    if (streamRetryRef.current.attempts >= STREAM_RETRY_MAX_ATTEMPTS) {
      return false;
    }

    streamRetryRef.current.attempts += 1;
    const attempt = streamRetryRef.current.attempts;
    lastStreamRetryAtRef.current = now;
    const resumeAt = Math.max(0, resolveAbsoluteCurrent());
    const preferTranscode = activePreferTranscodeRef.current;
    const mode = preferTranscode ? "transcode" : "direct";
    const cacheTag = `retry-${index}-${mode}-${attempt}-${now}`;
    const selected = fileOptions.find((item) => item.index === index);
    const startBytes =
      preferTranscode && selected
        ? estimateTranscodeStartBytes(resumeAt, totalDurationSecondsRef.current, selected.length)
        : 0;
    const nextUrl =
      preferTranscode && selected
        ? buildPlayerTransmissionHLSPlaylistURL(
          infoHash,
          index,
          cacheTag,
          buildHLSPlaylistOptions({ startSeconds: resumeAt, startBytes, durationSeconds: totalDurationSecondsRef.current })
        )
        : buildCurrentPlaybackStreamURL(cacheTag);
    if (!nextUrl) {
      return false;
    }
    activeStreamConfigKeyRef.current = buildPlaybackStreamConfigKey({
      fileIndex: index,
      preferTranscode,
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution,
      prebufferSeconds: transcodePrebufferSeconds
    });

    pendingResumeTargetRef.current = resumeAt;
    autoResumeWhenPlayableRef.current = true;
    pendingTranscodeSeekDisplayRef.current = preferTranscode ? { target: resumeAt, at: now } : null;
    if (preferTranscode) {
      setTranscodeStartOffsetSeconds(resumeAt);
      transcodeStartOffsetRef.current = resumeAt;
    }
    setPlayerError(null);
    setPlaybackLoading(true);
    setPlayerStatus("buffering");
    if (streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current);
    }
    const delayMs = Math.min(STREAM_RETRY_MAX_DELAY_MS, STREAM_RETRY_BASE_DELAY_MS * attempt);
    streamRetryTimerRef.current = window.setTimeout(() => {
      streamRetryTimerRef.current = null;
      applyStreamUrl(nextUrl, {
        autoplay: true,
        resumeAt: preferTranscode ? 0 : resumeAt,
        recovery: true
      });
    }, delayMs);
    logWarn("stream", "retry stream after playback disruption", {
      reason,
      attempt,
      maxAttempts: STREAM_RETRY_MAX_ATTEMPTS,
      delayMs,
      resumeAt,
      mode,
      preferTranscode
    });
    return true;
  }, [
    applyStreamUrl,
    buildCurrentPlaybackStreamURL,
    buildHLSPlaylistOptions,
    fileOptions,
    infoHash,
    logWarn,
    resolveAbsoluteCurrent,
    settlePausedPlayback,
    transcodeOutputResolution,
    transcodePrebufferSeconds
  ]);

  useEffect(() => {
    retryCurrentStreamRef.current = retryCurrentStream;
  }, [retryCurrentStream]);

  useEffect(() => {
    const releaseForPageExit = () => {
      releaseCurrentHLSRef.current("page_exit", true);
    };

    window.addEventListener("pagehide", releaseForPageExit);
    window.addEventListener("beforeunload", releaseForPageExit);
    return () => {
      releaseForPageExit();
      window.removeEventListener("pagehide", releaseForPageExit);
      window.removeEventListener("beforeunload", releaseForPageExit);
    };
  }, []);

  const emitTimelineRefreshEvents = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const player = plyrRef.current;
    const syntheticDuration = Number.isFinite(totalDurationSecondsRef.current)
      ? Math.max(0, totalDurationSecondsRef.current)
      : 0;

    if (player) {
      player.config.duration = syntheticDuration > 0 ? syntheticDuration : undefined;
      const previousInvert = Boolean(player.config.invertTime);
      player.config.invertTime = true;
      player.media.dispatchEvent(new Event("durationchange"));
      player.config.invertTime = previousInvert;
      player.media.dispatchEvent(new Event("timeupdate"));
      return;
    }

    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
  }, []);

  const loadSubtitles = useCallback(async () => {
    if (!infoHash) return;
    const loadToken = subtitleLoadTokenRef.current + 1;
    subtitleLoadTokenRef.current = loadToken;
    setSubtitleLoading(true);
    try {
      const items = await fetchPlayerSubtitles(infoHash);
      if (subtitleLoadTokenRef.current !== loadToken) return;
      const filtered = items.filter((item) => item.infoHash.trim().toLowerCase() === infoHash);
      setSubtitleItems(filtered);
      logInfo("subtitle", "subtitle list loaded", { count: filtered.length });
    } catch (error) {
      if (subtitleLoadTokenRef.current !== loadToken) return;
      const rawMessage = toErrorMessage(error, t("media.player.subtitleUploadFailed"));
      const message = normalizePlayerErrorMessage(rawMessage, t);
      if (rawMessage.trim().toLowerCase().includes("player disabled")) {
        setSubtitleItems([]);
        setSelectedSubtitleId("none");
      }
      logWarn("subtitle", "failed to load subtitles", { message });
    } finally {
      if (subtitleLoadTokenRef.current !== loadToken) return;
      setSubtitleLoading(false);
    }
  }, [infoHash, logInfo, logWarn, t]);

  const loadTorrentDetail = useCallback(async () => {
    if (!infoHash) {
      setDetail(null);
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }

    try {
      const response = await graphqlRequest<TorrentLookupResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
        input: {
          infoHashes: [infoHash],
          limit: 1,
          page: 1
        }
      });
      const item = response.torrentContent.search.items[0] || null;
      if (!item) {
        setDetail(null);
        logWarn("query", "torrent detail not found", { infoHash });
      } else {
        const runtimeSeconds = resolveRuntimeSecondsFromLookup(item);
        const mediaTitles = resolveMediaTitlesFromLookup(item);
        const mediaTitle = mediaTitles.primary || mediaTitles.zh || mediaTitles.en;
        const mediaEntryID = buildMediaEntryIdFromContentRef(item.contentType, item.contentSource, item.contentId);
        let mediaHref: string | undefined;
        if (mediaEntryID && mediaTitle) {
          const mediaCategory = resolveMediaCategory({
            contentType: item.contentType,
            title: item.title,
            content: {
              title: item.content?.title || undefined,
              collections: Array.isArray(item.content?.collections)
                ? item.content.collections
                    .map((collection) => ({
                      type: String(collection?.type || "").trim(),
                      name: String(collection?.name || "").trim()
                    }))
                    .filter((collection) => collection.type && collection.name)
                : []
            }
          });
          mediaHref = `/media/${encodeURIComponent(mediaCategory)}/${encodeURIComponent(mediaEntryID)}`;
        }
        setDetail({
          infoHash: item.infoHash,
          title: item.title || item.torrent.name,
          contentType: String(item.contentType || "").trim() || undefined,
          seeders: item.seeders,
          leechers: item.leechers,
          magnetUri: item.torrent.magnetUri || null,
          mediaTitle: mediaTitle || undefined,
          mediaTitleZh: mediaTitles.zh || undefined,
          mediaTitleEn: mediaTitles.en || undefined,
          mediaEntryId: mediaEntryID || undefined,
          mediaHref,
          sizeBytes: Number.isFinite(item.torrent.size) ? Math.max(0, Number(item.torrent.size)) : undefined,
          filesCount: Number.isFinite(item.torrent.filesCount) ? Math.max(0, Number(item.torrent.filesCount)) : undefined,
          sourceNames: Array.isArray(item.torrent.sources)
            ? item.torrent.sources
                .map((source) => String(source?.name || "").trim())
                .filter((value) => value.length > 0)
            : [],
          tagNames: Array.isArray(item.torrent.tagNames)
            ? item.torrent.tagNames
                .map((tag) => String(tag || "").trim())
                .filter((tag) => tag.length > 0)
            : [],
          videoResolution: String(item.videoResolution || "").trim() || undefined,
          videoSource: String(item.videoSource || "").trim() || undefined,
          publishedAt: String(item.publishedAt || "").trim() || undefined,
          runtimeSeconds: runtimeSeconds > 0 ? runtimeSeconds : undefined
        });
        logInfo("query", "torrent detail loaded", {
          infoHash: item.infoHash,
          runtimeSeconds: runtimeSeconds > 0 ? runtimeSeconds : 0
        });
      }
    } catch (error) {
      const message = toErrorMessage(error, t("media.player.loadFailed"));
      logWarn("query", "load torrent detail failed", { message });
      setDetail(null);
    }
  }, [infoHash, logInfo, logWarn, t]);

  useEffect(() => {
    const mediaEntryId = detail?.mediaEntryId;
    if (!mediaEntryId) {
      setSubtitleSiteLinks([]);
      return;
    }

    let cancelled = false;
    const loadSubtitleLinks = async () => {
      try {
        const mediaDetail = await fetchMediaDetail(mediaEntryId);
        if (cancelled) return;
        const title =
          locale === "zh"
            ? firstNonEmpty(mediaDetail.item.nameZh, mediaDetail.item.nameEn, mediaDetail.item.nameOriginal, mediaDetail.item.originalTitle, mediaDetail.item.title)
            : firstNonEmpty(mediaDetail.item.nameEn, mediaDetail.item.nameZh, mediaDetail.item.nameOriginal, mediaDetail.item.originalTitle, mediaDetail.item.title);
        const fallbackTitle = firstNonEmpty(title, detail.mediaTitle, detail.title) || detail.title;
        const links = (mediaDetail.subtitleTemplates ?? [])
          .map((template) => {
            const href = applySubtitleTemplate(template.urlTemplate, fallbackTitle, mediaDetail.item.releaseYear);
            if (!href) return null;
            return {
              id: template.id,
              label: template.name?.trim() || t("media.detail.subtitleTemplateFallback"),
              href
            };
          })
          .filter((item): item is PlayerSubtitleSiteLink => Boolean(item));
        setSubtitleSiteLinks(links);
      } catch (error) {
        if (cancelled) return;
        setSubtitleSiteLinks([]);
        logWarn("subtitle", "failed to load subtitle site links", {
          message: toErrorMessage(error, t("media.player.subtitleUploadFailed"))
        });
      }
    };
    void loadSubtitleLinks();

    return () => {
      cancelled = true;
    };
  }, [detail, locale, logWarn, t]);

  const bootstrapPlayer = useCallback(async () => {
    if (!infoHash) {
      bootstrapRunTokenRef.current += 1;
      setBootstrapped(false);
      setBootstrapLoading(false);
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }

    const runToken = bootstrapRunTokenRef.current + 1;
    bootstrapRunTokenRef.current = runToken;
    setBootstrapLoading(true);
    setPlayerStatus("initializing");
    setPlayerError(null);
    setBootstrapped(false);

    try {
      const deadline = Date.now() + BOOTSTRAP_MAX_WAIT_MS;
      let attempts = 0;

      while (bootstrapRunTokenRef.current === runToken) {
        let result: Awaited<ReturnType<typeof fetchPlayerTransmissionBootstrap>>;
        try {
          result = await fetchPlayerTransmissionBootstrap(infoHash);
        } catch (error) {
          const message = toErrorMessage(error, "");
          const normalized = message.toLowerCase();
          const metadataPending =
            normalized.includes("playable file not found") ||
            normalized.includes("player file not found");
          if (!metadataPending) {
            throw error;
          }

          attempts += 1;
          setPlayerStatus("initializing");
          setPlayerError(null);

          try {
            const pendingStatus = await fetchPlayerTransmissionStatus(infoHash);
            if (bootstrapRunTokenRef.current !== runToken) return;
            setStatusSnapshot(pendingStatus);
          } catch {
            // ignore status polling failures during bootstrap wait
          }

          if (attempts === 1 || attempts % 4 === 0) {
            logInfo("bootstrap", "waiting for metadata from peers", { attempt: attempts });
          }
          if (Date.now() >= deadline) {
            throw new Error(t("media.player.connectionTimeout"));
          }
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, BOOTSTRAP_RETRY_MS);
          });
          continue;
        }
        if (bootstrapRunTokenRef.current !== runToken) return;

        const rawFiles = result.status.files || [];
        const options = buildPlaybackFileOptions(rawFiles);
        if (options.length === 0) {
          if (rawFiles.length > 0) {
            throw new Error(t("media.player.noVideoFiles"));
          }
          setStatusSnapshot(result.status);
          setPlayerStatus("initializing");
          setPlayerError(null);

          attempts += 1;
          if (attempts === 1 || attempts % 4 === 0) {
            logInfo("bootstrap", "waiting for file list from transmission", {
              attempt: attempts,
              peers: result.status.peersConnected,
              progress: result.status.progress
            });
          }

          if (Date.now() >= deadline) {
            throw new Error(t("media.player.connectionTimeout"));
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, BOOTSTRAP_RETRY_MS);
          });
          continue;
        }

        let activeResult: { selectedFileIndex: number; status: PlayerTransmissionStatusResponse } = result;
        let activeOptions = options;
        const requestedIndex =
          Number.isInteger(pendingRequestedFileIndexRef.current) && (pendingRequestedFileIndexRef.current ?? -1) >= 0
            ? Number(pendingRequestedFileIndexRef.current)
            : -1;
        const rememberedIndex = readRememberedPlaybackFileIndex(infoHash, user?.id);
        const preferredIndex = [requestedIndex, rememberedIndex, activeResult.selectedFileIndex]
          .find((index) => Number.isInteger(index) && activeOptions.some((item) => item.index === index)) ?? -1;

        if (preferredIndex >= 0 && preferredIndex !== activeResult.selectedFileIndex) {
          activeResult = await selectPlayerTransmissionFile(infoHash, preferredIndex);
          if (bootstrapRunTokenRef.current !== runToken) return;
          activeOptions = buildPlaybackFileOptions(activeResult.status.files || []);
          if (activeOptions.length === 0) throw new Error(t("media.player.noVideoFiles"));
        }

        setStatusSnapshot(activeResult.status);
        applyFileOptions(activeOptions);

        const selected =
          activeOptions.find((item) => item.index === preferredIndex) ||
          activeOptions.find((item) => item.index === activeResult.selectedFileIndex) ||
          activeOptions[0]!;
        setSelectedFileIndex(selected.index);
        selectedFileIndexRef.current = selected.index;
        statusSnapshotRef.current = activeResult.status;
        writeRememberedPlaybackFileIndex(infoHash, user?.id, selected.index);
        if (requestedIndex === selected.index) {
          pendingRequestedFileIndexRef.current = null;
        }

        const preferTranscode = resolvePreferTranscode(selected, activeResult.status);
        const mode = preferTranscode ? "transcode" : "direct";
        const nextUrl = preferTranscode
          ? buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selected.index,
            `${selected.index}-${mode}-hls`,
            buildHLSPlaylistOptions({ durationSeconds: activeResult.status.selectedFileDurationSeconds || 0 })
          )
          : buildPlayerTransmissionStreamURL(infoHash, selected.index, `${selected.index}-${mode}-direct`);
        setTranscodeStartOffsetSeconds(0);
        transcodeStartOffsetRef.current = 0;
        pendingTranscodeSeekDisplayRef.current = null;
        activeStreamConfigKeyRef.current = buildPlaybackStreamConfigKey({
          fileIndex: selected.index,
          preferTranscode,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds
        });
        applyStreamUrl(nextUrl, { autoplay: false });

        setBootstrapped(true);
        setPlayerStatus("ready");
        logInfo("bootstrap", "player bootstrap complete", {
          selectedFileIndex: selected.index,
          files: activeOptions.length,
          mode,
          preferTranscode
        });
        return;
      }
    } catch (error) {
      if (bootstrapRunTokenRef.current !== runToken) return;
      const rawMessage = toErrorMessage(error, t("media.player.loadFailed"));
      const message = normalizePlayerErrorMessage(rawMessage, t);
      setPlayerStatus("error");
      setPlayerError(message);
      logError("bootstrap", "bootstrap failed", { message });
    } finally {
      if (bootstrapRunTokenRef.current === runToken) {
        setBootstrapLoading(false);
      }
    }
  }, [
    applyFileOptions,
    applyStreamUrl,
    buildHLSPlaylistOptions,
    infoHash,
    logError,
    logInfo,
    resolvePreferTranscode,
    t,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    user?.id
  ]);

  const handleSelectFile = useCallback(
    async (
      nextIndex: number,
      source: "panel" | "plyr",
      options?: { resumeAt?: number; autoplay?: boolean }
    ) => {
      if (!infoHash || !Number.isInteger(nextIndex) || nextIndex < 0) return;
      if (selectedFileIndexRef.current === nextIndex) return;

      fileSwitchingRef.current = true;
      setFileSwitching(true);
      try {
        const resumeAt = Math.max(0, Number(options?.resumeAt || 0));
        const autoplay = options?.autoplay ?? true;
        const result = await selectPlayerTransmissionFile(infoHash, nextIndex);
        const nextOptions = buildPlaybackFileOptions(result.status.files || []);
        if (nextOptions.length === 0) throw new Error(t("media.player.noVideoFiles"));
        applyFileOptions(nextOptions);
        setStatusSnapshot(result.status);
        statusSnapshotRef.current = result.status;

        const selected =
          nextOptions.find((item) => item.index === nextIndex) ||
          nextOptions.find((item) => item.index === result.selectedFileIndex) ||
          nextOptions[0];
        if (!selected) throw new Error(t("media.player.noVideoFiles"));

        userPausedRef.current = false;
        setSelectedFileIndex(selected.index);
        selectedFileIndexRef.current = selected.index;
        trackPreferencesHydratedKeyRef.current = "";
        setSelectedSubtitleId("none");
        setSelectedAudioTrackId("");
        setVideoDuration(0);
        totalDurationSecondsRef.current = 0;
        selectedAudioTrackQueryIndexRef.current = -1;
        audioTrackLoadTokenRef.current += 1;
        setServerAudioTracks([]);
        setAudioTrackOptions([]);
        setAudioTrackSelectionAvailable(false);
        writeRememberedPlaybackFileIndex(infoHash, user?.id, selected.index);

        const preferTranscode = shouldPreferTranscodeForPlayback(
          selected,
          result.status,
          transcodeOutputResolution,
          "",
          []
        );
        const durationForStartBytes = Math.max(0, result.status.selectedFileDurationSeconds || 0);
        const startBytes =
          preferTranscode && resumeAt > 0
            ? estimateTranscodeStartBytes(resumeAt, durationForStartBytes, selected.length)
            : 0;

        const nextUrl = preferTranscode
          ? buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selected.index,
            `${selected.index}-transcode-hls`,
            buildHLSPlaylistOptions({
              audioTrackIndex: -1,
              startSeconds: resumeAt,
              startBytes,
              durationSeconds: result.status.selectedFileDurationSeconds || totalDurationSecondsRef.current
            })
          )
          : buildPlayerTransmissionStreamURL(infoHash, selected.index, `${selected.index}-direct-direct`);
        setTranscodeStartOffsetSeconds(preferTranscode ? resumeAt : 0);
        transcodeStartOffsetRef.current = preferTranscode ? resumeAt : 0;
        pendingTranscodeSeekDisplayRef.current =
          preferTranscode && resumeAt > 0 ? { target: resumeAt, at: Date.now() } : null;
        pendingResumeTargetRef.current = resumeAt;
        userPausedRef.current = false;
        autoResumeWhenPlayableRef.current = autoplay;
        setAbsoluteCurrentSeconds(resumeAt);
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
        activeStreamConfigKeyRef.current = buildPlaybackStreamConfigKey({
          fileIndex: selected.index,
          preferTranscode,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds
        });
        applyStreamUrl(nextUrl, {
          autoplay,
          resumeAt: preferTranscode ? 0 : resumeAt
        });

        logInfo("stream", "playback file switched", {
          source,
          selectedFileIndex: selected.index,
          preferTranscode,
          resumeAt
        });
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.playbackError"));
        notifications.show({ color: "red", message });
        setPlayerError(message);
        setPlayerStatus("error");
        logError("stream", "failed to switch playback file", { message, source, nextIndex });
      } finally {
        fileSwitchingRef.current = false;
        setFileSwitching(false);
      }
    },
    [
      applyFileOptions,
      applyStreamUrl,
      buildHLSPlaylistOptions,
      infoHash,
      logError,
      logInfo,
      t,
      transcodeOutputResolution,
      transcodePrebufferSeconds,
      user?.id
    ]
  );

  useEffect(() => {
    if (!infoHash) {
      initializedInfoHashRef.current = "";
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }
    if (initializedInfoHashRef.current === infoHash) {
      return;
    }
    initializedInfoHashRef.current = infoHash;
    void loadTorrentDetail();
    void bootstrapPlayer();
    void loadSubtitles();
  }, [bootstrapPlayer, infoHash, loadSubtitles, loadTorrentDetail, t]);

  useEffect(() => {
    if (!bootstrapped) return;
    const target = pendingRequestedFileIndexRef.current;
    if (!Number.isInteger(target) || (target || -1) < 0) return;
    const targetIndex = Number(target);
    pendingRequestedFileIndexRef.current = null;
    if (selectedFileIndexRef.current === targetIndex) return;
    if (!fileOptions.some((item) => item.index === targetIndex)) return;
    void handleSelectFile(targetIndex, "panel");
  }, [bootstrapped, fileOptions, handleSelectFile, requestedFileIndex]);

  useEffect(() => {
    if (!infoHash) return;
    const record = readPlaybackProgressRecord(infoHash, user?.id);
    const seconds = Number.isFinite(record?.seconds) ? Math.max(0, Number(record?.seconds)) : 0;
    const fileIndex = Number.isInteger(record?.fileIndex) ? Number(record?.fileIndex) : -1;
    if (seconds < 15) {
      setResumePromptSeconds(0);
      setResumePromptFileIndex(-1);
      setResumePromptOpened(false);
      return;
    }
    setResumePromptSeconds(seconds);
    setResumePromptFileIndex(fileIndex);
    setResumePromptOpened(true);
  }, [infoHash, user?.id]);

  useEffect(() => {
    if (!infoHash || !bootstrapped) return;
    const storageKey = buildPlaybackProgressStorageKey(infoHash, user?.id);
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, resolveAbsoluteCurrent());
      if (!Number.isFinite(seconds) || seconds < 1) return;
      const duration = Math.max(0, totalDurationSecondsRef.current, videoDuration);
      const payload: PlaybackProgressRecord = {
        infoHash,
        fileIndex: selectedFileIndexRef.current,
        seconds,
        duration,
        updatedAt: Date.now()
      };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch { }
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [bootstrapped, infoHash, resolveAbsoluteCurrent, user?.id, videoDuration]);

  useEffect(() => {
    if (!bootstrapped || !infoHash) return;
    let cancelled = false;

    const runPoll = async () => {
      if (cancelled || document.hidden || fileSwitchingRef.current || statusPollInFlightRef.current) {
        return;
      }
      statusPollInFlightRef.current = true;
      try {
        const next = await fetchPlayerTransmissionStatus(infoHash);
        if (cancelled || fileSwitchingRef.current) return;
        setStatusSnapshot(next);
        statusSnapshotRef.current = next;
        const options = buildPlaybackFileOptions(next.files || []);
        if (options.length > 0) {
          applyFileOptions(options);
        }
        if (Number.isInteger(next.selectedFileIndex) && next.selectedFileIndex >= 0) {
          setSelectedFileIndex(next.selectedFileIndex);
          selectedFileIndexRef.current = next.selectedFileIndex;
        }
      } catch (error) {
        if (cancelled) return;
        logWarn("status", "poll status failed", { message: toErrorMessage(error, "poll failed") });
      } finally {
        statusPollInFlightRef.current = false;
      }
    };

    void runPoll();
    pollTimerRef.current = window.setInterval(() => {
      void runPoll();
    }, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [applyFileOptions, bootstrapped, infoHash, logWarn]);

  useEffect(() => {
    if (!bootstrapped || selectedFileIndex < 0) return;
    void loadServerAudioTracks(selectedFileIndex);
  }, [bootstrapped, loadServerAudioTracks, selectedFileIndex]);

  useEffect(() => {
    if (!bootstrapped || !infoHash || selectedFileIndex < 0 || fileOptions.length === 0) return;
    const selected = fileOptions.find((item) => item.index === selectedFileIndex);
    if (!selected) return;

    const preferTranscode = activePreferTranscode;
    const mode = preferTranscode ? "transcode" : "direct";
    const resumeAt = Math.max(0, resolveAbsoluteCurrent());
    const startBytes = estimateTranscodeStartBytes(resumeAt, totalDurationSecondsRef.current, selected.length);
    const nextConfigKey = buildPlaybackStreamConfigKey({
      fileIndex: selectedFileIndex,
      preferTranscode,
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution,
      prebufferSeconds: transcodePrebufferSeconds
    });
    const nextUrl = preferTranscode
      ? buildPlayerTransmissionHLSPlaylistURL(
        infoHash,
        selectedFileIndex,
        `${selectedFileIndex}-${mode}-hls-${Math.floor(resumeAt * 10)}-${transcodePrebufferSeconds}`,
        buildHLSPlaylistOptions({ startSeconds: resumeAt, startBytes, durationSeconds: totalDurationSecondsRef.current })
      )
      : buildPlayerTransmissionStreamURL(infoHash, selectedFileIndex, `${selectedFileIndex}-${mode}-direct`);
    if (activeStreamConfigKeyRef.current === nextConfigKey) {
      return;
    }

    setTranscodeStartOffsetSeconds(preferTranscode ? resumeAt : 0);
    transcodeStartOffsetRef.current = preferTranscode ? resumeAt : 0;
    pendingTranscodeSeekDisplayRef.current = preferTranscode ? { target: resumeAt, at: Date.now() } : null;
    pendingResumeTargetRef.current = resumeAt;
    const shouldAutoplay = shouldAutoplayStreamChange();
    autoResumeWhenPlayableRef.current = shouldAutoplay;
    setPlaybackLoading(shouldAutoplay);
    setPlayerStatus(shouldAutoplay ? "buffering" : "ready");
    activeStreamConfigKeyRef.current = nextConfigKey;
    applyStreamUrl(nextUrl, {
      autoplay: shouldAutoplay,
      resumeAt: preferTranscode ? 0 : resumeAt
    });

    logInfo("stream", "stream mode updated", {
      mode,
      selectedFileIndex,
      preferTranscode,
      resumeAt
    });
  }, [
    applyStreamUrl,
    activePreferTranscode,
    buildHLSPlaylistOptions,
    bootstrapped,
    fileOptions,
    infoHash,
    logInfo,
    resolveAbsoluteCurrent,
    selectedFileIndex,
    shouldAutoplayStreamChange,
    transcodeOutputResolution,
    transcodePrebufferSeconds
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    const isHLSStream = streamUrl.includes("/api/media/player/transmission/hls/playlist");

    const applyOptions = streamApplyOptionsRef.current;
    const resumeAt = Number.isFinite(applyOptions.resumeAt) ? Math.max(0, applyOptions.resumeAt || 0) : 0;
    const autoplay = Boolean(applyOptions.autoplay);

    const onLoaded = () => {
      if (resumeAt > 0) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // no-op
        }
      }
      if (transcodeSeekInFlightRef.current) {
        transcodeSeekInFlightRef.current = false;
        seekingSwitchingRef.current = false;
      }
      pendingTranscodeSeekDisplayRef.current = null;
      if (!applyOptions.recovery) {
        streamRetryRef.current = { key: "", attempts: 0 };
      }
      syncSelectedSubtitleTrack();
      refreshAudioTracks();
      syncSelectedAudioTrack();
      if (autoplay && !userPausedRef.current) {
        if (activePreferTranscodeRef.current && transcodePrebufferSeconds > 0) {
          setPrebufferProgressSeconds(0);
          logInfo("prebuffer", "start playback without paused prebuffer wait", { targetSeconds: transcodePrebufferSeconds });
        }
        attemptResumePlayback("stream_loadedmetadata", resumeAt > 0 ? resumeAt : undefined);
      } else {
        try {
          video.pause();
        } catch {
          // ignore pause failures from detached media elements
        }
        settlePausedPlayback();
      }
      emitTimelineRefreshEvents();
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    if (!isHLSStream) {
      video.load();
    }
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [attemptResumePlayback, emitTimelineRefreshEvents, logInfo, refreshAudioTracks, settlePausedPlayback, streamUrl, syncSelectedAudioTrack, syncSelectedSubtitleTrack, transcodePrebufferSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const refreshBufferedAhead = () => {
      if (!streamUrl) {
        setPrebufferProgressSeconds(0);
        setPlayableCacheAheadSeconds(0);
        return;
      }
      const nextProgress = resolveBufferedAheadSeconds();
      const nextPlayableCache = resolveCachedAheadSeconds();
      setPrebufferProgressSeconds((current) => (Math.abs(current - nextProgress) < 0.25 ? current : nextProgress));
      setPlayableCacheAheadSeconds((current) => (Math.abs(current - nextPlayableCache) < 0.25 ? current : nextPlayableCache));
      if (activePreferTranscodeRef.current) {
        const nextNetworkCache = hlsNetworkCacheDisplaySeconds(resolveHLSNetworkCacheAheadSeconds(), transcodePrebufferSeconds);
        setNetworkCacheSeconds((current) => (Math.abs(current - nextNetworkCache) < 0.25 ? current : nextNetworkCache));
      }
    };

    const events: Array<keyof HTMLMediaElementEventMap> = [
      "progress",
      "canplay",
      "canplaythrough",
      "loadeddata",
      "loadedmetadata",
      "timeupdate",
      "seeking",
      "seeked",
      "waiting",
      "playing"
    ];
    refreshBufferedAhead();
    for (const eventName of events) {
      video.addEventListener(eventName, refreshBufferedAhead);
    }
    const timer = window.setInterval(refreshBufferedAhead, 500);
    return () => {
      for (const eventName of events) {
        video.removeEventListener(eventName, refreshBufferedAhead);
      }
      window.clearInterval(timer);
    };
  }, [resolveBufferedAheadSeconds, resolveCachedAheadSeconds, resolveHLSNetworkCacheAheadSeconds, streamUrl, transcodePrebufferSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      const videoWidth = Number(video.videoWidth || 0);
      const videoHeight = Number(video.videoHeight || 0);
      if (videoWidth > 0 && videoHeight > 0) {
        const nextAspect = `${Math.max(1, Math.round(videoWidth))} / ${Math.max(1, Math.round(videoHeight))}`;
        setVideoAspectRatioCss((current) => (current === nextAspect ? current : nextAspect));
        const ratio = videoWidth / videoHeight;
        if (Number.isFinite(ratio) && ratio > 0.1 && ratio < 10) {
          setVideoAspectRatioValue((current) => (Math.abs(current - ratio) < 0.005 ? current : ratio));
        }
        setVideoSourceHeight((current) => (current === videoHeight ? current : videoHeight));
      }

      const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
      const pendingDisplay = pendingTranscodeSeekDisplayRef.current;
      const absoluteCurrent =
        activePreferTranscodeRef.current && pendingDisplay && (transcodeSeekInFlightRef.current || Date.now() - pendingDisplay.at < 2400)
          ? pendingDisplay.target
          : activePreferTranscodeRef.current
            ? transcodeStartOffsetRef.current + nativeCurrent
            : nativeCurrent;
      const durationSeconds = Number.isFinite(video.duration) ? Math.max(0, Number(video.duration)) : 0;
      if (Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds < 1e7) {
        const looksLikeGrowingTranscodeWindow =
          activePreferTranscodeRef.current && durationSeconds <= nativeCurrent + 2 && durationSeconds <= absoluteCurrent + 2;
        if (!looksLikeGrowingTranscodeWindow) {
          setVideoDuration((current) => (Math.abs(current - durationSeconds) < 0.25 ? current : durationSeconds));
        }
      }
      if (!isSeekingDragRef.current) {
        setAbsoluteCurrentSeconds(absoluteCurrent);
      }
      setIsVideoPaused(video.paused);
      setVideoPlaybackRate(Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1);
    };

    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("seeking", sync);
    video.addEventListener("seeked", sync);

    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("seeking", sync);
      video.removeEventListener("seeked", sync);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
      const pendingDisplay = pendingTranscodeSeekDisplayRef.current;
      const absoluteCurrent =
        activePreferTranscodeRef.current && pendingDisplay && (transcodeSeekInFlightRef.current || Date.now() - pendingDisplay.at < 2400)
          ? pendingDisplay.target
          : activePreferTranscodeRef.current
            ? transcodeStartOffsetRef.current + nativeCurrent
            : nativeCurrent;
      if (!isSeekingDragRef.current) {
        setAbsoluteCurrentSeconds((current) => (Math.abs(current - absoluteCurrent) < 0.05 ? current : absoluteCurrent));
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const markPlaybackProgress = (force = false) => {
      const seconds = Math.max(0, resolveAbsoluteCurrent());
      const previous = lastPlaybackProgressRef.current;
      if (
        force ||
        previous.at <= 0 ||
        Math.abs(seconds - previous.seconds) >= PLAYBACK_PROGRESS_EPSILON_SECONDS
      ) {
        lastPlaybackProgressRef.current = { at: Date.now(), seconds };
        stallStartedAtRef.current = 0;
      }
    };

    const markPotentialStall = () => {
      if (userPausedRef.current) return;
      if (video.paused && !autoResumeWhenPlayableRef.current) return;
      if (stallStartedAtRef.current <= 0) {
        stallStartedAtRef.current = Date.now();
      }
      if (lastPlaybackProgressRef.current.at <= 0) {
        markPlaybackProgress(true);
      }
    };

    const recoverIfStalled = (trigger: string) => {
      if (!streamUrlRef.current) return;
      if (userPausedRef.current) return;
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) return;
      if (seekingSwitchingRef.current || transcodeSeekInFlightRef.current) return;
      if (video.ended) return;
      if (video.paused && !autoResumeWhenPlayableRef.current) {
        stallStartedAtRef.current = 0;
        return;
      }

      const now = Date.now();
      const seconds = Math.max(0, resolveAbsoluteCurrent());
      const previous = lastPlaybackProgressRef.current;
      if (previous.at <= 0) {
        lastPlaybackProgressRef.current = { at: now, seconds };
        return;
      }
      if (Math.abs(seconds - previous.seconds) >= PLAYBACK_PROGRESS_EPSILON_SECONDS) {
        lastPlaybackProgressRef.current = { at: now, seconds };
        stallStartedAtRef.current = 0;
        return;
      }

      const duration = Math.max(
        0,
        Number.isFinite(video.duration) ? Number(video.duration) : 0,
        totalDurationSecondsRef.current
      );
      if (duration > 0 && duration - seconds <= 1.5) return;

      const bufferedAhead = resolveCachedAheadSeconds();
      const noProgressMs = now - previous.at;
      const stallMs = stallStartedAtRef.current > 0 ? now - stallStartedAtRef.current : 0;
      if (activePreferTranscodeRef.current && hlsRef.current) {
        const startupElapsed = now - hlsStartupAtRef.current;
        const lastActivityElapsed = now - hlsLastActivityAtRef.current;
        const lastFragmentElapsed = hlsLastFragmentBufferedAtRef.current > 0 ? now - hlsLastFragmentBufferedAtRef.current : Number.POSITIVE_INFINITY;
        if (
          startupElapsed < HLS_STARTUP_RECOVERY_GRACE_MS ||
          lastActivityElapsed < HLS_ACTIVITY_RECOVERY_GRACE_MS ||
          lastFragmentElapsed < HLS_ACTIVITY_RECOVERY_GRACE_MS
        ) {
          return;
        }
      }
      const isLikelyStalled =
        autoResumeWhenPlayableRef.current ||
        stallStartedAtRef.current > 0 ||
        noProgressMs >= PLAYBACK_STALL_RETRY_MS ||
        video.readyState < video.HAVE_FUTURE_DATA ||
        bufferedAhead < 0.75;
      if (!isLikelyStalled) return;

      const thresholdMs = autoResumeWhenPlayableRef.current ? PLAYBACK_STALL_GRACE_MS : PLAYBACK_STALL_RETRY_MS;
      if (noProgressMs < thresholdMs && stallMs < thresholdMs) return;
      if (now - lastAutoRecoveryAtRef.current < PLAYBACK_RECOVERY_COOLDOWN_MS) return;

      lastAutoRecoveryAtRef.current = now;
      setPlaybackLoading(true);
      setPlayerStatus("buffering");
      logWarn("stream", "playback stalled, retry stream", {
        trigger,
        noProgressMs,
        stallMs,
        bufferedAhead,
        readyState: video.readyState,
        currentSeconds: seconds
      });

      if (!retryCurrentStreamRef.current(`stall_${trigger}`)) {
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        setPlayerStatus("error");
        setPlayerError(tRef.current("media.player.playbackError"));
      }
    };

    const onProgressEvent = () => markPlaybackProgress(false);
    const onPlayingEvent = () => markPlaybackProgress(true);
    const onStallEvent = () => {
      markPotentialStall();
      recoverIfStalled("media_event");
    };
    const onCanPlayEvent = () => {
      stallStartedAtRef.current = 0;
    };

    markPlaybackProgress(true);
    video.addEventListener("timeupdate", onProgressEvent);
    video.addEventListener("playing", onPlayingEvent);
    video.addEventListener("seeked", onPlayingEvent);
    video.addEventListener("loadedmetadata", onPlayingEvent);
    video.addEventListener("waiting", onStallEvent);
    video.addEventListener("stalled", onStallEvent);
    video.addEventListener("suspend", onStallEvent);
    video.addEventListener("canplay", onCanPlayEvent);
    video.addEventListener("canplaythrough", onCanPlayEvent);
    const watchdogTimer = window.setInterval(() => {
      recoverIfStalled("watchdog");
    }, PLAYBACK_STALL_TICK_MS);

    return () => {
      video.removeEventListener("timeupdate", onProgressEvent);
      video.removeEventListener("playing", onPlayingEvent);
      video.removeEventListener("seeked", onPlayingEvent);
      video.removeEventListener("loadedmetadata", onPlayingEvent);
      video.removeEventListener("waiting", onStallEvent);
      video.removeEventListener("stalled", onStallEvent);
      video.removeEventListener("suspend", onStallEvent);
      video.removeEventListener("canplay", onCanPlayEvent);
      video.removeEventListener("canplaythrough", onCanPlayEvent);
      window.clearInterval(watchdogTimer);
    };
  }, [logWarn, resolveAbsoluteCurrent, resolveCachedAheadSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resumeIfPending = () => {
      if (userPausedRef.current) return;
      if (!autoResumeWhenPlayableRef.current) return;
      const player = plyrRef.current;
      const playResult = player?.play ? player.play() : video.play();
      void Promise.resolve(playResult).catch(() => {
        if (video.paused && video.readyState >= 2) {
          settlePausedPlayback();
        }
      });
    };

    const onWaiting = () => {
      if (userPausedRef.current) {
        settlePausedPlayback();
        return;
      }
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
        settlePausedPlayback();
        return;
      }
      if (video.paused && !autoResumeWhenPlayableRef.current && !seekingSwitchingRef.current) {
        return;
      }
      const cachedAhead = activePreferTranscodeRef.current ? resolveHLSNetworkCacheAheadSeconds() : resolveCachedAheadSeconds();
      if (cachedAhead >= 1.5) {
        setPlaybackLoading(false);
        setPlayerStatus(video.paused ? "ready" : "playing");
        return;
      }
      setPlaybackLoading(true);
      setPlayerStatus("buffering");
    };

    const onCanPlay = () => {
      if (userPausedRef.current) {
        settlePausedPlayback();
        return;
      }
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
        settlePausedPlayback();
        return;
      }
      if (autoResumeWhenPlayableRef.current) {
        resumeIfPending();
        return;
      }
      setPlaybackLoading(false);
      setPlayerStatus(video.paused ? "ready" : "playing");
    };

    const onPlaying = () => {
      if (userPausedRef.current) {
        video.pause();
        settlePausedPlayback();
        return;
      }
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
        video.pause();
        settlePausedPlayback();
        return;
      }
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      streamRetryRef.current = { key: "", attempts: 0 };
      setPlaybackLoading(false);
      setPlayerStatus("playing");
      setIsVideoPaused(false);
    };

    const onPause = () => {
      if (userPausedRef.current) {
        if (activePreferTranscodeRef.current && !hlsReleasedForPauseRef.current && !seekingSwitchingRef.current && !fileSwitchingRef.current) {
          releaseCurrentHLSRef.current("pause");
        }
        settlePausedPlayback();
        return;
      }
      if (!autoResumeWhenPlayableRef.current) {
        if (activePreferTranscodeRef.current && !hlsReleasedForPauseRef.current && !seekingSwitchingRef.current && !fileSwitchingRef.current) {
          releaseCurrentHLSRef.current("pause");
        }
        settlePausedPlayback();
      }
    };

    const onError = () => {
      transcodeSeekInFlightRef.current = false;
      seekingSwitchingRef.current = false;
      pendingTranscodeSeekDisplayRef.current = null;
      if (userPausedRef.current) {
        settlePausedPlayback();
        return;
      }
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
        settlePausedPlayback();
        return;
      }
      if (retryCurrentStreamRef.current("video_error")) {
        return;
      }
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      setPlaybackLoading(false);
      setPlayerStatus("error");
      setPlayerError(tRef.current("media.player.playbackError"));
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("canplaythrough", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [resolveCachedAheadSeconds, resolveHLSNetworkCacheAheadSeconds, settlePausedPlayback]);

  useEffect(() => {
    if (!statusSnapshot || !autoResumeWhenPlayableRef.current || userPausedRef.current) return;
    const target = pendingResumeTargetRef.current;
    if (!Number.isFinite(target) || (target || 0) <= 0) return;

    const timeline = Math.max(totalDurationSecondsRef.current, videoDuration, target || 0);
    if (!Number.isFinite(timeline) || timeline <= 0) return;
    const contiguous = Math.max(0, Math.min(timeline, (statusSnapshot.selectedFileContiguousRatio || 0) * timeline));
    if (contiguous + 1 < (target || 0)) return;

    const video = videoRef.current;
    if (!video) return;
    const player = plyrRef.current;
    const playResult = player?.play ? player.play() : video.play();
    void Promise.resolve(playResult).catch(() => {
      // continue waiting if browser still refuses playback
    });
  }, [statusSnapshot, videoDuration]);

  useEffect(() => {
    syncSelectedSubtitleTrack();
  }, [syncSelectedSubtitleTrack]);

  useEffect(() => {
    syncSelectedSubtitleTrack();
  }, [subtitleTrackSrcMap, syncSelectedSubtitleTrack]);

  useEffect(() => {
    refreshAudioTracks();
  }, [refreshAudioTracks, streamUrl]);

  useEffect(() => {
    syncSelectedAudioTrack();
  }, [selectedAudioTrackId, streamUrl, syncSelectedAudioTrack]);

  useEffect(() => {
    const tracks = getNativeAudioTracks(videoRef.current);
    if (!tracks) return;
    if (typeof tracks.addEventListener !== "function" || typeof tracks.removeEventListener !== "function") {
      return;
    }

    const onChange: EventListener = () => {
      refreshAudioTracks();
    };
    tracks.addEventListener("change", onChange);
    tracks.addEventListener("addtrack", onChange);
    tracks.addEventListener("removetrack", onChange);
    return () => {
      tracks.removeEventListener?.("change", onChange);
      tracks.removeEventListener?.("addtrack", onChange);
      tracks.removeEventListener?.("removetrack", onChange);
    };
  }, [refreshAudioTracks, streamUrl]);

  useEffect(() => {
    if (selectedSubtitleId === "none") return;
    if (subtitleItems.length === 0) return;
    const exists = subtitleItems.some((item) => String(item.id) === selectedSubtitleId);
    if (!exists) {
      setSelectedSubtitleId("none");
    }
  }, [selectedSubtitleId, subtitleItems]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const stage = playerStageRef.current;
      if (!stage) {
        setIsFullscreenActive(false);
        return;
      }
      const docAny = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const currentFullscreen = document.fullscreenElement || docAny.webkitFullscreenElement || null;
      const plyrFullscreenActive = Boolean(plyrRef.current?.fullscreen?.active);
      const active = plyrFullscreenActive || Boolean(currentFullscreen && stage.contains(currentFullscreen));
      setIsFullscreenActive(active);
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnter = () => setIsPipActive(true);
    const onLeave = () => setIsPipActive(false);

    video.addEventListener("enterpictureinpicture", onEnter as EventListener);
    video.addEventListener("leavepictureinpicture", onLeave as EventListener);

    setIsPipActive(Boolean((document as Document & { pictureInPictureElement?: Element | null }).pictureInPictureElement));
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter as EventListener);
      video.removeEventListener("leavepictureinpicture", onLeave as EventListener);
    };
  }, [streamUrl]);

  useEffect(() => {
    if (!settingsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = inlineSettingsRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setSettingsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    return () => {
      if (stageClickTimerRef.current !== null) {
        window.clearTimeout(stageClickTimerRef.current);
        stageClickTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localPlayer: PlyrLike | null = null;

    if (!canInitializePlyr) {
      return;
    }

    const mountPlyr = async () => {
      const video = videoRef.current;
      if (!video) return;

      const plyrModule = await import("plyr");
      if (cancelled || !videoRef.current) return;

      plyrRef.current?.destroy();

      const PlayerCtor = plyrModule.default as unknown as new (
        target: HTMLVideoElement,
        options: Record<string, unknown>
      ) => PlyrLike;

      localPlayer = new PlayerCtor(videoRef.current, {
        controls: [],
        settings: [],
        duration: totalDurationSecondsRef.current > 0 ? totalDurationSecondsRef.current : undefined,
        clickToPlay: false,
        captions: {
          active: true,
          update: true,
          language: "auto"
        }
      });

      plyrRef.current = localPlayer;
      emitTimelineRefreshEvents();

      localPlayer.on("ready", () => {
        if (cancelled) return;
        setPlayerStatus("ready");
        emitTimelineRefreshEvents();
      });

      localPlayer.on("playing", () => {
        if (cancelled) return;
        if (userPausedRef.current) {
          localPlayer?.pause?.();
          settlePausedPlayback();
          return;
        }
        if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
          plyrRef.current?.pause?.();
          settlePausedPlayback();
          return;
        }
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        streamRetryRef.current = { key: "", attempts: 0 };
        setPlaybackLoading(false);
        setPlayerStatus("playing");
        setIsVideoPaused(false);
      });

      localPlayer.on("waiting", () => {
        if (cancelled) return;
        if (userPausedRef.current) {
          settlePausedPlayback();
          return;
        }
        if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
          settlePausedPlayback();
          return;
        }
        const media = localPlayer?.media;
        if (media?.paused && !autoResumeWhenPlayableRef.current && !seekingSwitchingRef.current) {
          return;
        }
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
      });

      localPlayer.on("error", () => {
        if (cancelled) return;
        transcodeSeekInFlightRef.current = false;
        seekingSwitchingRef.current = false;
        pendingTranscodeSeekDisplayRef.current = null;

        if (userPausedRef.current) {
          settlePausedPlayback();
          return;
        }
        if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
          settlePausedPlayback();
          return;
        }

        if (retryCurrentStreamRef.current("plyr_error")) {
          return;
        }

        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        setPlayerStatus("error");
        setPlayerError(tRef.current("media.player.playbackError"));
      });
    };

    if (videoRef.current) {
      void mountPlyr();
    }

    return () => {
      cancelled = true;
      localPlayer?.destroy();
      if (plyrRef.current === localPlayer) {
        plyrRef.current = null;
      }
    };
  }, [canInitializePlyr, emitTimelineRefreshEvents, settlePausedPlayback]);

  const handleUploadSubtitle = useCallback(
    async (file: File | null) => {
      if (!file || !infoHash) return false;
      const name = file.name || "subtitle";
      const ext = fileExtension(name);

      if (![".srt", ".vtt", ".ass", ".ssa"].includes(ext)) {
        notifications.show({ color: "yellow", message: t("media.player.subtitleUnsupported") });
        return false;
      }

      try {
        const raw = await readFileText(file);
        const contentVtt = convertSubtitleToVtt(name, raw);
        const label = name.replace(/\.[^.]+$/, "") || `Subtitle ${Date.now()}`;
        const language = normalizeSubtitleLanguage(label);

        const saved = await createPlayerSubtitle({
          infoHash,
          label,
          language,
          contentVtt
        });

        notifications.show({ color: "green", message: t("media.player.subtitleUploaded") });
        logInfo("subtitle", "subtitle uploaded", { subtitleId: saved.id, label });

        await loadSubtitles();
        setSelectedSubtitleId(String(saved.id));
        return true;
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
        logWarn("subtitle", "subtitle upload failed", { name, message });
        return false;
      }
    },
    [infoHash, loadSubtitles, logInfo, logWarn, t]
  );

  const handleDeleteSubtitle = useCallback(
    async (id: number) => {
      if (!infoHash || !Number.isInteger(id) || id <= 0) return;
      try {
        await deletePlayerSubtitle({ infoHash, subtitleId: id });
        if (selectedSubtitleId === String(id)) {
          setSelectedSubtitleId("none");
        }
        await loadSubtitles();
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
      }
    },
    [infoHash, loadSubtitles, selectedSubtitleId, t]
  );

  const handleAdjustSubtitleOffset = useCallback(
    async (id: number, deltaSeconds: number) => {
      if (!infoHash || !Number.isInteger(id) || id <= 0 || !Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
      const target = subtitleItems.find((item) => item.id === id);
      if (!target) return;
      const nextOffsetSeconds = normalizeSubtitleOffsetValue((target.offsetSeconds || 0) + deltaSeconds);
      try {
        await updatePlayerSubtitle({
          infoHash,
          subtitleId: id,
          offsetSeconds: nextOffsetSeconds
        });
        await loadSubtitles();
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
      }
    },
    [infoHash, loadSubtitles, subtitleItems, t]
  );

  const handleSubtitleUploadPick = useCallback(
    async (file: File | null) => {
      await handleUploadSubtitle(file);
    },
    [handleUploadSubtitle]
  );

  const handleSeekCommit = useCallback(
    async (targetSecondsInput: number, source: "panel" | "plyr" = "panel") => {
      const video = videoRef.current;
      if (!video || !infoHash || !selectedFileOption) return;
      if (!Number.isFinite(targetSecondsInput)) return;

      const fullDuration = totalDurationSeconds > 0 ? totalDurationSeconds : videoDuration;
      const clamped = Math.max(0, Math.min(fullDuration > 0 ? fullDuration : targetSecondsInput, targetSecondsInput));

      let releaseOnLoadedMetadata = false;
      try {
        seekingSwitchingRef.current = true;
        userPausedRef.current = false;
        if (activePreferTranscode) {
          const nativeTarget = clamped - transcodeStartOffsetRef.current;
          const bufferedAhead = resolveBufferedAheadAtSeconds(nativeTarget);
          if (nativeTarget >= 0 && bufferedAhead >= 0.5) {
            video.currentTime = nativeTarget;
            setAbsoluteCurrentSeconds(clamped);
            pendingTranscodeSeekDisplayRef.current = null;
            transcodeSeekInFlightRef.current = false;
            if (video.paused) {
              attemptResumePlayback("hls_cached_seek", clamped);
            } else {
              setPlaybackLoading(false);
              setPlayerStatus("playing");
            }
            logInfo("seek", "seek inside hls network cache", {
              source,
              targetSeconds: clamped,
              cacheAheadSeconds: bufferedAhead
            });
            return;
          }

          releaseOnLoadedMetadata = true;
          transcodeSeekInFlightRef.current = true;
          pendingTranscodeSeekDisplayRef.current = { target: clamped, at: Date.now() };
          pendingResumeTargetRef.current = clamped;
          autoResumeWhenPlayableRef.current = true;
          setPlaybackLoading(true);
          setPlayerStatus("buffering");
          setAbsoluteCurrentSeconds(clamped);
          const startBytes = estimateTranscodeStartBytes(clamped, fullDuration, selectedFileOption.length);
          const seekUrl = buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selectedFileOption.index,
            `seek-${selectedFileOption.index}-${Math.floor(clamped * 10)}-${transcodePrebufferSeconds}`,
            buildHLSPlaylistOptions({ startSeconds: clamped, startBytes, durationSeconds: fullDuration })
          );
          setTranscodeStartOffsetSeconds(clamped);
          transcodeStartOffsetRef.current = clamped;
          applyStreamUrl(seekUrl, { autoplay: true, resumeAt: 0 });
          logInfo("seek", "seek via transcode restart", {
            source,
            targetSeconds: clamped,
            startBytes
          });
          return;
        }

        video.currentTime = clamped;
        setAbsoluteCurrentSeconds(clamped);
        attemptResumePlayback("seek", clamped);
        setTranscodeStartOffsetSeconds(0);
        transcodeStartOffsetRef.current = 0;
        pendingTranscodeSeekDisplayRef.current = null;
        logInfo("seek", "seek via native range request", { source, targetSeconds: clamped });
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.playbackError"));
        transcodeSeekInFlightRef.current = false;
        pendingTranscodeSeekDisplayRef.current = null;
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        releaseOnLoadedMetadata = false;
        if (source === "panel") {
          notifications.show({ color: "red", message });
        }
        logWarn("seek", "seek failed", { targetSeconds: clamped, message });
      } finally {
        if (!releaseOnLoadedMetadata) {
          window.setTimeout(() => {
            seekingSwitchingRef.current = false;
          }, 50);
        }
      }
    },
    [
      activePreferTranscode,
      applyStreamUrl,
      attemptResumePlayback,
      buildHLSPlaylistOptions,
      infoHash,
      logInfo,
      logWarn,
      resolveBufferedAheadAtSeconds,
      selectedFileOption,
      setPlaybackLoading,
      setPlayerStatus,
      t,
      totalDurationSeconds,
      transcodePrebufferSeconds,
      videoDuration
    ]
  );

  const handleCopyLogs = useCallback(async () => {
    const text = diagnostics
      .map((item) => {
        const stamp = new Date(item.timestamp).toLocaleTimeString();
        const line = `[${stamp}] [${item.level.toUpperCase()}] ${item.step}: ${item.message}`;
        return item.detailsText ? `${line}\n${item.detailsText}` : line;
      })
      .join("\n\n");

    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: "green", message: t("media.player.copyLogsDone") });
    } catch {
      notifications.show({ color: "red", message: t("media.player.copyLogsFailed") });
    }
  }, [diagnostics, t]);

  const handleTogglePlayback = useCallback(() => {
    const player = plyrRef.current;
    const video = videoRef.current;
    if (!video) return;
    const isPaused = video.paused;
    if (isPaused) {
      userPausedRef.current = false;
      if (activePreferTranscode && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current) && infoHash && selectedFileOption) {
        const resumeAt = Math.max(0, resolveAbsoluteCurrent());
        const startBytes = estimateTranscodeStartBytes(resumeAt, totalDurationSecondsRef.current, selectedFileOption.length);
        const nextUrl = buildPlayerTransmissionHLSPlaylistURL(
          infoHash,
          selectedFileOption.index,
          `resume-${selectedFileOption.index}-${Math.floor(resumeAt * 10)}-${Date.now()}`,
          buildHLSPlaylistOptions({ startSeconds: resumeAt, startBytes, durationSeconds: totalDurationSecondsRef.current })
        );
        setTranscodeStartOffsetSeconds(resumeAt);
        transcodeStartOffsetRef.current = resumeAt;
        pendingTranscodeSeekDisplayRef.current = resumeAt > 0 ? { target: resumeAt, at: Date.now() } : null;
        pendingResumeTargetRef.current = resumeAt;
        autoResumeWhenPlayableRef.current = true;
        hlsSuspendedRef.current = false;
        hlsReleasedForPauseRef.current = false;
        activeStreamConfigKeyRef.current = buildPlaybackStreamConfigKey({
          fileIndex: selectedFileOption.index,
          preferTranscode: true,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds
        });
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
        setIsVideoPaused(false);
        applyStreamUrl(nextUrl, { autoplay: true, resumeAt: 0 });
        return;
      }
      userPausedRef.current = false;
      setIsVideoPaused(false);
      attemptResumePlayback("toggle_play");
      return;
    }
    userPausedRef.current = true;
    autoResumeWhenPlayableRef.current = false;
    pendingResumeTargetRef.current = null;
    setPlaybackLoading(false);
    if (player?.pause) {
      setIsVideoPaused(true);
      player.pause();
      if (activePreferTranscode && !hlsReleasedForPauseRef.current) {
        releaseCurrentHLSRef.current("manual_pause");
      }
      return;
    }
    setIsVideoPaused(true);
    video.pause();
    if (activePreferTranscode && !hlsReleasedForPauseRef.current) {
      releaseCurrentHLSRef.current("manual_pause");
    }
  }, [
    activePreferTranscode,
    applyStreamUrl,
    attemptResumePlayback,
    buildHLSPlaylistOptions,
    infoHash,
    resolveAbsoluteCurrent,
    selectedFileOption,
    transcodeOutputResolution,
    transcodePrebufferSeconds
  ]);

  const handleStageClickTogglePlayback = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".torrent-inline-controls") || target.closest(".torrent-inline-settings-menu")) {
      return;
    }
    if (event.detail > 1) {
      return;
    }
    if (stageClickTimerRef.current !== null) {
      window.clearTimeout(stageClickTimerRef.current);
    }
    stageClickTimerRef.current = window.setTimeout(() => {
      stageClickTimerRef.current = null;
      handleTogglePlayback();
    }, PLAYER_STAGE_CLICK_DELAY_MS);
  }, [handleTogglePlayback]);

  useEffect(() => {
    if (!canInitializePlyr) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      const editable = Boolean(target?.isContentEditable) || tag === "input" || tag === "textarea" || tag === "select";
      if (editable) return;
      const revealControlsForKeyboardSeek = () => {
        setControlsActive(true);
        if (revealControlsTimerRef.current !== null) {
          window.clearTimeout(revealControlsTimerRef.current);
        }
        revealControlsTimerRef.current = window.setTimeout(() => {
          revealControlsTimerRef.current = null;
          setControlsActive(false);
        }, isFullscreenActive ? INLINE_CONTROLS_FULLSCREEN_HIDE_MS : INLINE_CONTROLS_KEYBOARD_HIDE_MS);
      };
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handleTogglePlayback();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        revealControlsForKeyboardSeek();
        void handleSeekCommit(Math.max(0, resolveAbsoluteCurrent() - 30), "panel");
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        revealControlsForKeyboardSeek();
        void handleSeekCommit(resolveAbsoluteCurrent() + 30, "panel");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (revealControlsTimerRef.current !== null) {
        window.clearTimeout(revealControlsTimerRef.current);
        revealControlsTimerRef.current = null;
      }
    };
  }, [canInitializePlyr, handleSeekCommit, handleTogglePlayback, isFullscreenActive, resolveAbsoluteCurrent]);

  const handleSetPlaybackRate = useCallback((rate: number) => {
    const player = plyrRef.current;
    const video = videoRef.current;
    if (!video) return;
    const next = Number.isFinite(rate) && rate > 0 ? rate : 1;
    if (player) {
      try {
        player.speed = next;
      } catch {
        // fallback to native rate assignment below
      }
    }
    video.playbackRate = next;
    setVideoPlaybackRate(next);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextRate = normalizePlaybackRatePreference(videoPlaybackRate);
    if (Math.abs(video.playbackRate - nextRate) >= 0.01) {
      video.playbackRate = nextRate;
    }
    const player = plyrRef.current;
    if (player) {
      try {
        player.speed = nextRate;
      } catch {
        // ignore speed sync fallback
      }
    }
  }, [streamUrl, videoPlaybackRate]);

  const handleTogglePip = useCallback(async () => {
    const player = plyrRef.current;
    if (player && typeof player.pip === "boolean") {
      try {
        player.pip = !player.pip;
        return;
      } catch {
        // fallback to native PiP below
      }
    }

    const video = videoRef.current;
    if (!video) return;
    const pipDocument = document as Document & {
      pictureInPictureEnabled?: boolean;
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    if (!pipDocument.pictureInPictureEnabled || typeof (video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> }).requestPictureInPicture !== "function") {
      return;
    }
    try {
      if (pipDocument.pictureInPictureElement) {
        if (typeof pipDocument.exitPictureInPicture === "function") {
          await pipDocument.exitPictureInPicture();
        }
        return;
      }
      await (video as HTMLVideoElement & { requestPictureInPicture: () => Promise<void> }).requestPictureInPicture();
    } catch {
      // no-op
    }
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const stage = playerStageRef.current;
    const docAny = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const stageAny = stage as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    const currentFullscreen = document.fullscreenElement || docAny.webkitFullscreenElement || null;

    if (currentFullscreen) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (docAny.webkitExitFullscreen) {
          await docAny.webkitExitFullscreen();
        }
        return;
      } catch {
        // no-op
      }
    }

    if (stage) {
      try {
        if (stage.requestFullscreen) {
          await stage.requestFullscreen();
          return;
        }
        if (stageAny?.webkitRequestFullscreen) {
          await stageAny.webkitRequestFullscreen();
          return;
        }
      } catch {
        // fallback to native video fullscreen below
      }
    }

    const videoAny = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (videoAny && typeof videoAny.webkitEnterFullscreen === "function") {
      try {
        videoAny.webkitEnterFullscreen();
      } catch {
        // no-op
      }
    }
  }, []);

  const handleStageDoubleClickToggleFullscreen = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".torrent-inline-controls") || target.closest(".torrent-inline-settings-menu")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (stageClickTimerRef.current !== null) {
      window.clearTimeout(stageClickTimerRef.current);
      stageClickTimerRef.current = null;
    }
    void handleToggleFullscreen();
  }, [handleToggleFullscreen]);

  const handleSettingsButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSettingsOpen((value) => !value);
  }, []);

  const handleCycleVideoFitMode = useCallback(() => {
    setVideoFitMode((current) => {
      if (current === "contain") return "cover";
      if (current === "cover") return "fill";
      return "contain";
    });
  }, []);

  const authoritativeDurationSeconds =
    statusSnapshot?.selectedFileIndex === selectedFileIndex
      ? statusSnapshot?.selectedFileDurationSeconds || 0
      : 0;
  const knownTimelineSeconds = totalDurationSeconds;
  const totalTimelineSeconds = Math.max(knownTimelineSeconds, absoluteCurrentSeconds);
  const seekMax = totalTimelineSeconds > 0 ? totalTimelineSeconds : 1;
  const seekHoverThumbnail = useMemo(() => {
    if (seekHoverSeconds === null || !infoHash || selectedFileIndex < 0 || !selectedFileOption) {
      return null;
    }
    const seconds = Math.max(0, Math.min(seekMax, seekHoverSeconds));
    const quantizedSeconds = Math.max(0, Math.round(seconds / 10) * 10);
    const startBytes = estimateTranscodeStartBytes(quantizedSeconds, seekMax, selectedFileOption.length);
    const key = `${selectedFileIndex}:${quantizedSeconds}:${startBytes}`;
    return {
      key,
      url: buildPlayerTransmissionThumbnailURL(infoHash, selectedFileIndex, quantizedSeconds, key, { startBytes })
    };
  }, [infoHash, seekHoverSeconds, seekMax, selectedFileIndex, selectedFileOption]);
  const displayedCurrentSeconds = Math.max(
    0,
    Math.min(seekMax, isSeekingDrag ? (seekDraftSeconds ?? absoluteCurrentSeconds) : absoluteCurrentSeconds)
  );

  useEffect(() => {
    if (isSeekingDrag) return;
    setSeekDraftSeconds(null);
  }, [displayedCurrentSeconds, isSeekingDrag]);

  const commitInlineSeek = useCallback(
    (nextValue?: number | null) => {
      const raw = Number.isFinite(Number(nextValue)) ? Number(nextValue) : absoluteCurrentSeconds;
      const clamped = Math.max(0, Math.min(seekMax, raw));
      isSeekingDragRef.current = false;
      setIsSeekingDrag(false);
      setSeekDraftSeconds(clamped);
      if (Math.abs(clamped - absoluteCurrentSeconds) < 0.15) {
        return;
      }
      setAbsoluteCurrentSeconds(clamped);
      void handleSeekCommit(clamped, "panel");
    },
    [absoluteCurrentSeconds, handleSeekCommit, seekMax]
  );

  const handleResumePromptContinue = useCallback(async () => {
    setResumePromptOpened(false);
    userPausedRef.current = false;
    attemptResumePlayback("resume_prompt_click", resumePromptSeconds);
    if (resumePromptFileIndex >= 0 && resumePromptFileIndex !== selectedFileIndexRef.current) {
      await handleSelectFile(resumePromptFileIndex, "panel", {
        resumeAt: resumePromptSeconds,
        autoplay: true
      });
      return;
    }
    await handleSeekCommit(resumePromptSeconds, "panel");
  }, [attemptResumePlayback, handleSeekCommit, handleSelectFile, resumePromptFileIndex, resumePromptSeconds]);

  const handleResumePromptRestart = useCallback(() => {
    setResumePromptOpened(false);
    setResumePromptSeconds(0);
    setResumePromptFileIndex(-1);
    if (!infoHash) return;
    const storageKey = buildPlaybackProgressStorageKey(infoHash, user?.id);
    try {
      window.localStorage.removeItem(storageKey);
    } catch { }
  }, [infoHash, user?.id]);

  const stageBootstrapLoading = !canInitializePlyr && !playerError;
  const downloadedRatio = Math.round((statusSnapshot?.selectedFileReadyRatio || 0) * 100);
  const contiguousRatio = Math.round((statusSnapshot?.selectedFileContiguousRatio || 0) * 100);
  const { playableRatio, availableRanges } = useMemo(() => {
    const raw = statusSnapshot?.selectedFileAvailableRanges;
    if (!Array.isArray(raw) || raw.length === 0) {
      return {
        playableRatio: 0,
        availableRanges: [] as Array<{ start: number; end: number }>
      };
    }
    const normalized = raw
      .map((item) => ({
        start: Math.max(0, Math.min(1, Number(item?.startRatio ?? 0))),
        end: Math.max(0, Math.min(1, Number(item?.endRatio ?? 0)))
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start);
    if (normalized.length === 0) {
      return {
        playableRatio: 0,
        availableRanges: [] as Array<{ start: number; end: number }>
      };
    }
    const merged: Array<{ start: number; end: number }> = [];
    for (const item of normalized) {
      const last = merged[merged.length - 1];
      if (!last || item.start > last.end) {
        merged.push({ ...item });
        continue;
      }
      if (item.end > last.end) {
        last.end = item.end;
      }
    }
    const ratio = Math.round(merged.reduce((acc, item) => acc + Math.max(0, item.end - item.start), 0) * 100);
    const maxSegments = 220;
    if (merged.length <= maxSegments) {
      return {
        playableRatio: ratio,
        availableRanges: merged
      };
    }
    const sampled: Array<{ start: number; end: number }> = [];
    const step = Math.ceil(merged.length / maxSegments);
    for (let idx = 0; idx < merged.length; idx += step) {
      const chunk = merged.slice(idx, Math.min(merged.length, idx + step));
      if (chunk.length === 0) continue;
      sampled.push({
        start: chunk[0]!.start,
        end: chunk[chunk.length - 1]!.end
      });
    }
    return {
      playableRatio: ratio,
      availableRanges: sampled
    };
  }, [statusSnapshot?.selectedFileAvailableRanges]);
  const playedRatio = Math.max(0, Math.min(1, seekMax > 0 ? displayedCurrentSeconds / seekMax : 0));
  const sourceResolutionLabel = selectedFileOption?.resolutionLabel || "-";
  const outputResolutionLabel = transcodeOutputResolution > 0 ? `${transcodeOutputResolution}p` : t("media.player.resolutionOutputOriginal");
  const networkCacheLabel = `${formatSecondsCounter(activePreferTranscode ? networkCacheSeconds : prebufferProgressSeconds)} ${t("media.player.prebufferSeconds")}`;
  const playbackStatusLabel =
    isVideoPaused && (playerStatus === "playing" || playerStatus === "ready")
      ? t("media.player.statusPaused")
      : statusToLabel(playerStatus, t);
  const downloadTaskProgress = Math.round((statusSnapshot?.progress || 0) * 100);
  const isDownloadComplete = downloadedRatio >= 100 && playableRatio >= 100;
  const isDownloading = !isDownloadComplete && ((statusSnapshot?.downloadRate || 0) > 0 || downloadTaskProgress < 100);
  const transferStatusLabel = isDownloadComplete
    ? t("media.player.statusDownloadComplete")
    : isDownloading
      ? t("media.player.statusDownloading")
      : t("media.player.statusPreparing");
  const hasKnownPlaybackDuration =
    authoritativeDurationSeconds > 0 ||
    (knownTimelineSeconds > 0 && knownTimelineSeconds > displayedCurrentSeconds + 2);
  const playbackPositionLabel = `${formatClock(displayedCurrentSeconds)} / ${
    hasKnownPlaybackDuration ? formatClock(knownTimelineSeconds) : "--:--"
  }`;
  const detailPublishedLabel = detail?.publishedAt
    ? (() => {
        const parsed = new Date(detail.publishedAt || "");
        return Number.isNaN(parsed.getTime()) ? detail.publishedAt || "" : parsed.toLocaleString();
      })()
    : "";
  const detailTagPreview = (detail?.tagNames || []).slice(0, 8);
  const detailSourceLabel = (detail?.sourceNames || []).join(" · ");
  const mediaTitleDisplay = useMemo(() => {
    if (!detail) return "";
    const parts = [detail.mediaTitleZh, detail.mediaTitleEn]
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);
    if (parts.length <= 1) return parts[0] || detail.mediaTitle || "";
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(part);
    }
    return deduped.join(" / ");
  }, [detail]);
  const playerStageStyle: CSSProperties = {
    ["--torrent-subtitle-scale" as string]: String(subtitleStylePreset.scale),
    ["--torrent-subtitle-color" as string]: subtitleStylePreset.textColor,
    ["--torrent-subtitle-bg" as string]: subtitleStylePreset.backgroundColor,
    ["--torrent-subtitle-vertical-percent" as string]: `${subtitleStylePreset.verticalPercent}%`,
    ["--torrent-video-object-fit" as string]: videoFitMode,
    ["--torrent-player-aspect-ratio" as string]: videoAspectRatioCss,
    ["--torrent-player-aspect-ratio-value" as string]: String(videoAspectRatioValue),
    ["--torrent-player-height-offset" as string]: isFullscreenActive ? "132px" : "340px"
  };
  const effectivePlaybackCacheAheadSeconds = activePreferTranscode ? networkCacheSeconds : playableCacheAheadSeconds;
  const showPlaybackBusyOverlay =
    !stageBootstrapLoading &&
    (
      fileSwitching ||
      ((playbackLoading || (playerStatus === "buffering" && !isVideoPaused)) && effectivePlaybackCacheAheadSeconds < 1.5)
    );
  const shouldKeepInlineControlsVisible =
    settingsOpen || subtitleManagerOpened || resumePromptOpened || isSeekingDrag || showPlaybackBusyOverlay || isVideoPaused;
  const inlineControlsVisible = !isFullscreenActive || shouldKeepInlineControlsVisible || controlsActive;

  const scheduleControlsHide = useCallback((delayMs: number) => {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
    if (!isFullscreenActive) {
      setControlsActive(true);
      return;
    }
    if (shouldKeepInlineControlsVisible) {
      setControlsActive(true);
      return;
    }
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsActive(false);
    }, Math.max(0, delayMs));
  }, [isFullscreenActive, shouldKeepInlineControlsVisible]);

  const revealInlineControls = useCallback((delayMs = INLINE_CONTROLS_HIDE_MS) => {
    setControlsActive(true);
    scheduleControlsHide(delayMs);
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (shouldKeepInlineControlsVisible) {
      if (controlsHideTimerRef.current !== null) {
        window.clearTimeout(controlsHideTimerRef.current);
        controlsHideTimerRef.current = null;
      }
      setControlsActive(true);
      return;
    }
    if (!isFullscreenActive) {
      setControlsActive(true);
      return;
    }
    scheduleControlsHide(INLINE_CONTROLS_FULLSCREEN_HIDE_MS);
  }, [isFullscreenActive, scheduleControlsHide, shouldKeepInlineControlsVisible]);

  const inlineControlRevealDelayMs = isFullscreenActive ? INLINE_CONTROLS_FULLSCREEN_HIDE_MS : INLINE_CONTROLS_HIDE_MS;

  const subtitleManagerPanel = subtitleManagerOpened ? (
    <div
      className="torrent-player-floating-panel torrent-player-subtitle-panel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="torrent-player-panel-header">
        <div className="torrent-player-panel-title">{t("media.player.subtitleManagerTitle")}</div>
        <button
          type="button"
          className="torrent-inline-title-icon-btn"
          onClick={() => setSubtitleManagerOpened(false)}
          aria-label={t("common.close")}
        >
          <X size={14} />
        </button>
      </div>
      <Tabs value={subtitleManagerTab} onChange={setSubtitleManagerTab} className="torrent-player-panel-tabs">
        <Tabs.List>
          <Tabs.Tab value="files">{t("media.player.subtitleManagerTabFiles")}</Tabs.Tab>
          <Tabs.Tab value="style">{t("media.player.subtitleManagerTabStyle")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="files" pt="sm">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text c="dimmed" size="sm">{t("media.player.subtitleManagerHint")}</Text>
              <Tooltip label={t("media.player.subtitleUploadPlaceholder")} withArrow>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={t("media.player.subtitleUpload")}
                  title={t("media.player.subtitleUploadPlaceholder")}
                  disabled={subtitleLoading}
                  onClick={() => {
                    subtitleUploadInputRef.current?.click();
                  }}
                >
                  <Upload size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <input
              ref={subtitleUploadInputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa"
              disabled={subtitleLoading}
              className="torrent-subtitle-upload-input"
              onChange={(event) => {
                const picked = event.currentTarget.files?.[0] || null;
                event.currentTarget.value = "";
                if (!picked) return;
                void handleSubtitleUploadPick(picked);
              }}
            />

            {subtitleItems.length === 0 ? (
              <Text size="sm" c="dimmed">{t("media.player.subtitleManagerEmpty")}</Text>
            ) : (
              <Stack gap="xs">
                {subtitleItems.map((item) => (
                  <div className="torrent-subtitle-item-card" key={item.id}>
                    <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fw={700} size="sm" className="torrent-subtitle-item-title">
                          {item.label || `Subtitle ${item.id}`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t("media.player.subtitleOffset")}: {formatSubtitleOffsetLabel(item.offsetSeconds || 0)}
                        </Text>
                      </Stack>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void handleAdjustSubtitleOffset(item.id, -0.5);
                          }}
                          aria-label={t("media.player.subtitleOffsetMinus")}
                        >
                          <Minus size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void handleAdjustSubtitleOffset(item.id, 0.5);
                          }}
                          aria-label={t("media.player.subtitleOffsetPlus")}
                        >
                          <Plus size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          color="red"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void handleDeleteSubtitle(item.id);
                          }}
                          aria-label={t("media.player.subtitleDelete")}
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </div>
                ))}
              </Stack>
            )}
            {subtitleSiteLinks.length > 0 ? (
              <div className="torrent-subtitle-site-links">
                <Group gap="xs" wrap="wrap">
                  {subtitleSiteLinks.map((link) => (
                    <Button
                      key={link.id}
                      component="a"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      variant="light"
                      size="xs"
                      rightSection={<ExternalLink size={13} />}
                    >
                      {link.label}
                    </Button>
                  ))}
                </Group>
              </div>
            ) : null}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="style" pt="sm">
          <Stack gap="md">
            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleSize")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: 0.9, label: "S" },
                  { value: 1, label: "M" },
                  { value: 1.15, label: "L" },
                  { value: 1.3, label: "XL" },
                  { value: 1.5, label: "XXL" },
                  { value: 1.7, label: "XXXL" }
                ].map((item) => (
                  <button
                    key={`ssm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${Math.abs(subtitleStylePreset.scale - item.value) < 0.01 ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, scale: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStylePosition")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: 0, label: "0%" },
                  { value: 4, label: "4%" },
                  { value: 8, label: "8%" },
                  { value: 12, label: "12%" },
                  { value: 15, label: "15%" },
                  { value: 18, label: "18%" }
                ].map((item) => (
                  <button
                    key={`spm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.verticalPercent === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, verticalPercent: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleColor")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: "#f6f9ff", label: t("media.player.subtitleStyleColorWhite") },
                  { value: "#ffe082", label: t("media.player.subtitleStyleColorYellow") },
                  { value: "#d3ecff", label: t("media.player.subtitleStyleColorCyan") },
                  { value: "#b6f8c8", label: t("media.player.subtitleStyleColorGreen") },
                  { value: "#ffc88a", label: t("media.player.subtitleStyleColorOrange") },
                  { value: "#ffd2ef", label: t("media.player.subtitleStyleColorPink") }
                ].map((item) => (
                  <button
                    key={`scm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.textColor === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, textColor: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleBackground")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: "rgba(0, 0, 0, 0)", label: t("media.player.subtitleStyleBgNone") },
                  { value: "rgba(0, 0, 0, 0.15)", label: "15%" },
                  { value: "rgba(0, 0, 0, 0.25)", label: "25%" },
                  { value: "rgba(0, 0, 0, 0.4)", label: "40%" },
                  { value: "rgba(0, 0, 0, 0.55)", label: "55%" },
                  { value: "rgba(0, 0, 0, 0.7)", label: "70%" }
                ].map((item) => (
                  <button
                    key={`sbm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.backgroundColor === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, backgroundColor: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </div>
  ) : null;

  const resumePromptPanel = resumePromptOpened ? (
    <div className="torrent-player-center-layer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="torrent-player-floating-panel torrent-player-resume-panel">
        <div className="torrent-player-panel-header">
          <div className="torrent-player-panel-title">{t("media.player.resumePromptTitle")}</div>
          <button
            type="button"
            className="torrent-inline-title-icon-btn"
            onClick={handleResumePromptRestart}
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>
        <Text size="sm" c="dimmed">
          {t("media.player.resumePromptMessage")} <span className="torrent-player-resume-time">{formatClock(resumePromptSeconds)}</span>
        </Text>
        <div className="torrent-player-panel-actions">
          <button type="button" className="torrent-player-panel-action" onClick={handleResumePromptRestart}>
            {t("media.player.resumePromptRestart")}
          </button>
          <button type="button" className="torrent-player-panel-action is-primary" onClick={() => void handleResumePromptContinue()}>
            {t("media.player.resumePromptContinue")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Stack gap="md" className="torrent-player-page">
      {detail ? (
        <Group justify="space-between" align="center" wrap="wrap" gap="sm" className="torrent-player-header">
          <div className="torrent-player-header-main">
            <Group gap="xs" wrap="wrap" className="torrent-player-title-row">
              <Text size="lg" fw={700} className="torrent-player-main-title">{detail.title}</Text>
              <Badge variant="outline">{playbackStatusLabel}</Badge>
              <Badge variant="outline" color={isDownloadComplete ? "green" : isDownloading ? "yellow" : "slate"}>
                {transferStatusLabel}
              </Badge>
              <Badge variant="light">{t("media.player.playbackPosition")}: {playbackPositionLabel}</Badge>
            </Group>
          </div>
          <Tooltip label={t("media.player.diagnosticsTitle")} withArrow>
            <ActionIcon
              className="app-icon-btn torrent-player-diagnostics-btn"
              variant="default"
              size={36}
              aria-label={t("media.player.diagnosticsTitle")}
              onClick={() => setDiagnosticsOpened(true)}
            >
              <Settings2 size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : null}


      {!infoHash ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {t("media.player.missingInfoHash")}
        </Alert>
      ) : null}

      {playerError ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {playerError}
        </Alert>
      ) : null}

      {stageBootstrapLoading ? (
        <div className="torrent-bootstrap-overlay">
          <Card className="torrent-bootstrap-card" withBorder>
            <Stack gap="sm" align="center" py="md">
              <Loader />
              <Text fw={700}>{t("media.player.stageBootstrapTitle")}</Text>
              <Text c="dimmed" size="sm">{t("media.player.stageBootstrapHint")}</Text>
            </Stack>
          </Card>
        </div>
      ) : null}

      {canInitializePlyr ? (
        <Card className="torrent-player-shell" withBorder>
          <div
            ref={playerStageRef}
            className={`torrent-player-stage-shell${isVideoPaused ? " is-paused" : ""}${isFullscreenActive ? " is-fullscreen" : ""}${inlineControlsVisible ? " controls-visible" : ""}`}
            onMouseMove={() => revealInlineControls(inlineControlRevealDelayMs)}
            onMouseEnter={() => revealInlineControls(inlineControlRevealDelayMs)}
            onPointerDown={() => revealInlineControls(isFullscreenActive ? INLINE_CONTROLS_FULLSCREEN_HIDE_MS : INLINE_CONTROLS_KEYBOARD_HIDE_MS)}
            onTouchStart={() => revealInlineControls(INLINE_CONTROLS_FULLSCREEN_HIDE_MS)}
          >
            <div
              className="torrent-player-wrap torrent-player-plyr-wrap"
              style={playerStageStyle}
              onClick={handleStageClickTogglePlayback}
              onDoubleClick={handleStageDoubleClickToggleFullscreen}
            >
              <video
                ref={videoRef}
                src={!activePreferTranscode ? streamUrl || undefined : undefined}
                className="torrent-player-video torrent-plyr"
                autoPlay={false}
                playsInline
                preload="auto"
                crossOrigin="anonymous"
              >
                {subtitleItems.map((item) => {
                  const trackSrc = subtitleTrackSrcMap[item.id] || buildPlayerSubtitleContentURL(infoHash, item.id, item.updatedAt);
                  return (
                    <track
                      key={`${item.id}:${item.updatedAt}:${trackSrc}`}
                      kind="subtitles"
                      label={item.label || `Subtitle ${item.id}`}
                      srcLang={normalizeSubtitleLanguage(item.language)}
                      src={trackSrc}
                      default={false}
                    />
                  );
                })}
              </video>
            </div>
            {showPlaybackBusyOverlay ? (
              <div className="torrent-player-buffering-overlay">
                <Stack gap={6} align="center">
                  <Loader size="sm" />
                  <Text fw={600} size="sm">{t("media.player.waitingPlayableTitle")}</Text>
                  <Text c="dimmed" size="xs">{t("media.player.waitingPlayableHint")}</Text>
                  {activePreferTranscode ? (
                    <Text c="dimmed" size="xs">
                      {t("media.player.networkCacheStatus")} {networkCacheLabel}
                    </Text>
                  ) : null}
                </Stack>
              </div>
            ) : null}
            {resumePromptPanel}
            {subtitleManagerPanel}

            <div className="torrent-inline-controls">
              <div className="torrent-inline-controls-row">
                <button
                  type="button"
                  className="torrent-inline-play-btn"
                  aria-label={isVideoPaused ? t("media.player.play") : t("media.player.pause")}
                  onClick={handleTogglePlayback}
                >
                  {isVideoPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>

                <div className="torrent-inline-time">{formatClock(displayedCurrentSeconds)}</div>

                <div
                  className="torrent-inline-seek-shell"
                  onMouseMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    if (rect.width <= 0) return;
                    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    setSeekHoverRatio(ratio);
                    setSeekHoverSeconds(seekMax * ratio);
                  }}
                  onMouseLeave={() => {
                    setSeekHoverSeconds(null);
                    setSeekPreviewFailedKey("");
                    setSeekPreviewLoadedKey("");
                  }}
                >
                  {seekHoverSeconds !== null ? (
                    <div className="torrent-inline-seek-hover" style={{ left: `${seekHoverRatio * 100}%` }}>
                      <span className="torrent-inline-seek-preview-time">{formatClock(seekHoverSeconds)}</span>
                      {seekHoverThumbnail && seekPreviewFailedKey !== seekHoverThumbnail.key ? (
                        <Image
                          className={`torrent-inline-seek-preview-img${seekPreviewLoadedKey === seekHoverThumbnail.key ? " is-loaded" : ""}`}
                          src={seekHoverThumbnail.url}
                          alt=""
                          width={160}
                          height={90}
                          unoptimized
                          loading="eager"
                          onLoad={() => setSeekPreviewLoadedKey(seekHoverThumbnail.key)}
                          onError={() => {
                            setSeekPreviewLoadedKey("");
                            setSeekPreviewFailedKey(seekHoverThumbnail.key);
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="torrent-inline-seek-track">
                    {availableRanges.map((range, idx) => (
                      <div
                        key={`${idx}:${range.start}:${range.end}`}
                        className="torrent-inline-seek-available-segment"
                        style={{
                          left: `${range.start * 100}%`,
                          width: `${Math.max(0, (range.end - range.start) * 100)}%`
                        }}
                      />
                    ))}
                    <div className="torrent-inline-seek-contiguous" style={{ width: `${contiguousRatio}%` }} />
                    <div className="torrent-inline-seek-played" style={{ width: `${playedRatio * 100}%` }} />
                  </div>
                  <input
                    type="range"
                    className="torrent-inline-seek-input"
                    min={0}
                    max={seekMax}
                    step={0.1}
                    value={displayedCurrentSeconds}
                    onPointerDown={() => {
                      isSeekingDragRef.current = true;
                      setIsSeekingDrag(true);
                      setSeekDraftSeconds(displayedCurrentSeconds);
                    }}
                    onInput={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (!Number.isFinite(next)) return;
                      isSeekingDragRef.current = true;
                      setIsSeekingDrag(true);
                      setSeekDraftSeconds(next);
                    }}
                    onChange={(event) => {
                      commitInlineSeek(Number(event.currentTarget.value));
                    }}
                    onKeyUp={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End" || event.key === "PageUp" || event.key === "PageDown") {
                        const next = Number(event.currentTarget.value);
                        commitInlineSeek(next);
                      }
                    }}
                  />
                </div>

                <div className="torrent-inline-time">{formatClock(seekMax)}</div>

                <div className="torrent-inline-actions">
                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${videoFitMode !== "contain" ? " is-active" : ""}`}
                    onClick={handleCycleVideoFitMode}
                    title={
                      videoFitMode === "contain"
                        ? t("media.player.fitModeContain")
                        : videoFitMode === "cover"
                          ? t("media.player.fitModeCover")
                          : t("media.player.fitModeFill")
                    }
                  >
                    {videoFitMode === "contain" ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <rect x="7.5" y="8.5" width="9" height="7" rx="1.2" />
                      </svg>
                    ) : videoFitMode === "cover" ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <rect x="5.5" y="6.5" width="13" height="11" rx="1.2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <path d="M8 12h8" />
                        <path d="M8 12l2-2M8 12l2 2" />
                        <path d="M16 12l-2-2M16 12l-2 2" />
                      </svg>
                    )}
                  </button>

                  <div className="torrent-inline-settings-wrap" ref={inlineSettingsRef}>
                    <button
                      type="button"
                      className={`torrent-inline-icon-btn${settingsOpen ? " is-active" : ""}`}
                      onClick={handleSettingsButtonClick}
                      title={t("common.settings")}
                    >
                      <Settings2 size={15} />
                    </button>
                    {settingsOpen ? (
                      <div
                        className="torrent-inline-settings-menu"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="torrent-inline-settings-section">
                          <div className="torrent-inline-settings-title">{t("media.player.playbackSpeedTitle")}</div>
                          <div className="torrent-inline-rate-grid">
                            {playbackRateOptions.map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                className={`torrent-inline-rate-btn${Math.abs(videoPlaybackRate - rate) < 0.01 ? " is-active" : ""}`}
                                onClick={() => {
                                  handleSetPlaybackRate(rate);
                                }}
                              >
                                {rate.toFixed(rate % 1 === 0 ? 0 : 2).replace(/\.00$/, "")}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="torrent-inline-settings-section">
                          <div className="torrent-inline-settings-title">{t("media.player.resolutionOutputTitle")}</div>
                          <div className="torrent-inline-rate-grid">
                            {transcodeResolutionOptions.map((item) => (
                              <button
                                key={`resolution:${item.value}`}
                                type="button"
                                className={`torrent-inline-rate-btn${transcodeOutputResolution === item.value ? " is-active" : ""}`}
                                onClick={() => {
                                  handleSetTranscodeOutputResolution(item.value);
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="torrent-inline-settings-section">
                          <div className="torrent-inline-settings-title">{t("media.player.prebufferTargetTitle")}</div>
                          <div className="torrent-inline-rate-grid">
                            {TRANSCODE_PREBUFFER_OPTIONS.map((seconds) => (
                              <button
                                key={`prebuffer:${seconds}`}
                                type="button"
                                className={`torrent-inline-rate-btn${transcodePrebufferSeconds === seconds ? " is-active" : ""}`}
                                onClick={() => {
                                  setTranscodePrebufferSeconds(seconds);
                                }}
                              >
                                {`${seconds}s`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="torrent-inline-settings-section">
                          <div className="torrent-inline-settings-title">{t("media.player.audioTrackTitle")}</div>
                          {audioTrackSelectionAvailable ? (
                            <div className="torrent-inline-subtitle-list">
                              {audioTrackOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`torrent-inline-subtitle-btn${selectedAudioTrackId === option.value ? " is-active" : ""}`}
                                  onClick={() => {
                                    setSelectedAudioTrackId(option.value);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <Text size="xs" c="dimmed">{t("media.player.audioTrackUnavailable")}</Text>
                          )}
                        </div>

                        <div className="torrent-inline-settings-section">
                          <div className="torrent-inline-settings-title-row">
                            <div className="torrent-inline-settings-title">{t("media.player.subtitleTrack")}</div>
                            <button
                              type="button"
                              className="torrent-inline-title-icon-btn"
                              onClick={() => {
                                setSettingsOpen(false);
                                setSubtitleManagerOpened(true);
                              }}
                              title={t("media.player.subtitleManage")}
                            >
                              <Settings2 size={13} />
                            </button>
                          </div>
                          <div className="torrent-inline-subtitle-list">
                            {subtitleTrackOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`torrent-inline-subtitle-btn${selectedSubtitleId === option.value ? " is-active" : ""}`}
                                onClick={() => {
                                  setSelectedSubtitleId(option.value);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${isPipActive ? " is-active" : ""}`}
                    onClick={() => {
                      void handleTogglePip();
                    }}
                    title={t("media.player.pictureInPicture")}
                  >
                    <PictureInPicture2 size={15} />
                  </button>

                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${isFullscreenActive ? " is-active" : ""}`}
                    onClick={() => {
                      void handleToggleFullscreen();
                    }}
                    title={isFullscreenActive ? t("media.player.exitFullscreen") : t("media.player.fullscreen")}
                  >
                    {isFullscreenActive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="torrent-player-control-surface">
            {detail ? (
              <div className="torrent-player-info-panel">
                <div className="torrent-player-info-grid">
                  <section className="torrent-player-info-card torrent-player-info-card-featured">
                    <div className="torrent-player-info-card-title">{t("media.player.mediaInfoTitle")}</div>
                    {mediaTitleDisplay && detail.mediaHref ? (
                      <Link
                        className="torrent-player-info-title-link"
                        href={detail.mediaHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {mediaTitleDisplay}
                        <ExternalLink size={13} />
                      </Link>
                    ) : mediaTitleDisplay ? (
                      <div className="torrent-player-info-title-text">{mediaTitleDisplay}</div>
                    ) : (
                      <div className="torrent-player-info-title-text">{detail.title}</div>
                    )}
                    <div className="torrent-player-chip-cloud">
                      {detail.contentType ? (
                        <Badge variant="light">{t("media.player.contentTypeLabel")}: {detail.contentType}</Badge>
                      ) : null}
                      {sourceResolutionLabel && sourceResolutionLabel !== "-" ? (
                        <Badge variant="light">{t("media.player.resolution")}: {sourceResolutionLabel}</Badge>
                      ) : null}
                      {detail.videoSource ? (
                        <Badge variant="light">{t("media.player.videoSourceLabel")}: {detail.videoSource}</Badge>
                      ) : null}
                      {detailPublishedLabel ? (
                        <Badge variant="light">{t("media.player.publishedAtLabel")}: {detailPublishedLabel}</Badge>
                      ) : null}
                    </div>
                  </section>

                  <section className="torrent-player-info-card">
                    <div className="torrent-player-info-card-title">{t("media.player.transferInfoTitle")}</div>
                    <div className="torrent-player-chip-cloud">
                      {!isDownloadComplete ? (
                        <Badge variant="outline">{t("media.player.progress")}: {downloadTaskProgress}%</Badge>
                      ) : null}
                      <Badge variant="outline">{t("media.player.downloadSpeed")}: {formatSpeed(statusSnapshot?.downloadRate || 0)}</Badge>
                      <Badge variant="outline">{t("media.player.peers")}: {statusSnapshot?.peersConnected || 0}</Badge>
                      <Badge variant="outline">{t("media.player.downloadedLabel")}: {downloadedRatio}%</Badge>
                      {streamUrl ? (
                        <Badge variant="outline">
                          {t("media.player.networkCacheTitle")}: {networkCacheLabel}
                        </Badge>
                      ) : null}
                      {!isDownloadComplete ? (
                        <Badge variant="outline">{t("media.player.fileReadyLabel")}: {playableRatio}%</Badge>
                      ) : null}
                      {!isDownloadComplete ? (
                        <Badge variant="outline">{t("media.player.contiguousLabel")}: {contiguousRatio}%</Badge>
                      ) : null}
                      <Badge variant="outline">{t("media.player.resolutionOutputTitle")}: {outputResolutionLabel}</Badge>
                      <Badge variant="outline">{t("media.player.sequentialDownloadLabel")}: {statusSnapshot?.sequentialDownload ? t("media.player.sequentialDownloadOn") : t("media.player.sequentialDownloadOff")}</Badge>
                    </div>
                  </section>

                  <section className="torrent-player-info-card">
                    <div className="torrent-player-info-card-title">{t("media.player.torrentInfoTitle")}</div>
                    {detail.magnetUri ? (
                      <a
                        className="torrent-player-hash-link"
                        href={detail.magnetUri}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{t("media.player.infoHashLabel")}</span>
                        <strong>{detail.infoHash}</strong>
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <div className="torrent-player-hash-link torrent-player-hash-link-static">
                        <span>{t("media.player.infoHashLabel")}</span>
                        <strong>{detail.infoHash}</strong>
                      </div>
                    )}
                    <div className="torrent-player-chip-cloud">
                      <Badge variant="light">{t("media.player.seeders")}: {detail.seeders ?? 0}</Badge>
                      <Badge variant="light">{t("media.player.leechers")}: {detail.leechers ?? 0}</Badge>
                      {detail.sizeBytes ? (
                        <Badge variant="light">{t("media.player.torrentSize")}: {formatBytes(detail.sizeBytes)}</Badge>
                      ) : null}
                      {Number.isFinite(detail.filesCount) ? (
                        <Badge variant="light">{t("media.player.fileCount")}: {detail.filesCount}</Badge>
                      ) : null}
                      {detailSourceLabel ? (
                        <Badge variant="light">{t("media.player.torrentSourcesLabel")}: {detailSourceLabel}</Badge>
                      ) : null}
                      {detailTagPreview.map((tag) => (
                        <Badge key={`tag:${tag}`} variant="outline">{tag}</Badge>
                      ))}
                      {detail.tagNames && detail.tagNames.length > detailTagPreview.length ? (
                        <Badge variant="outline">+{detail.tagNames.length - detailTagPreview.length}</Badge>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
            <div className="torrent-player-controls-grid">
              <Select
                label={t("media.player.selectedFile")}
                data={fileOptions}
                value={selectedFileIndex >= 0 ? String(selectedFileIndex) : null}
                onChange={(value) => {
                  const nextIndex = Number(value);
                  if (!Number.isInteger(nextIndex) || nextIndex < 0) return;
                  void handleSelectFile(nextIndex, "panel");
                }}
                disabled={fileSwitching || fileOptions.length === 0}
                searchable
              />

            </div>
          </div>
        </Card>
      ) : null}

      <Modal
        opened={diagnosticsOpened}
        onClose={() => setDiagnosticsOpened(false)}
        title={t("media.player.diagnosticsTitle")}
        size="lg"
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text c="dimmed" size="sm">{t("media.player.diagnosticsHint")}</Text>
            <Group gap="xs">
              <Button variant="default" size="xs" onClick={() => setDiagnostics([])}>{t("media.player.clearLogs")}</Button>
              <Button size="xs" onClick={() => void handleCopyLogs()}>{t("media.player.copyLogs")}</Button>
            </Group>
          </Group>
          <ScrollArea h={320} className="torrent-diagnostics-scroll">
            {diagnostics.length === 0 ? (
              <Text c="dimmed" size="sm">{t("media.player.noDiagnostics")}</Text>
            ) : (
              <Stack gap="xs">
                {diagnostics.map((item) => (
                  <div className="torrent-diagnostic-item" key={item.id}>
                    <Group justify="space-between" gap="xs">
                      <Text size="xs" fw={700}>[{item.level.toUpperCase()}] {item.step}</Text>
                      <Text size="xs" c="dimmed">{new Date(item.timestamp).toLocaleTimeString()}</Text>
                    </Group>
                    <Text size="sm" className="torrent-diagnostic-line">{item.message}</Text>
                    {item.detailsText ? <Text size="xs" c="dimmed" className="torrent-diagnostic-details">{item.detailsText}</Text> : null}
                  </div>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Stack>
      </Modal>

    </Stack>
  );
}

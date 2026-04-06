"use client";

import Link from "next/link";
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
  Text,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle, ArrowLeft, Maximize2, Minimize2, Pause, PictureInPicture2, Play, Settings2, Trash2, Upload } from "lucide-react";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { useI18n } from "@/languages/provider";
import {
  buildPlayerSubtitleContentURL,
  buildPlayerTransmissionStreamURL,
  createPlayerSubtitle,
  deletePlayerSubtitle,
  fetchPlayerSubtitles,
  fetchPlayerTransmissionBootstrap,
  fetchPlayerTransmissionStatus,
  selectPlayerTransmissionFile,
  type PlayerSubtitleItem,
  type PlayerTransmissionFile,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";

type TorrentLookupResponse = {
  torrentContent: {
    search: {
      items: Array<{
        infoHash: string;
        title: string;
        seeders?: number | null;
        leechers?: number | null;
        torrent: {
          name: string;
          size: number;
          magnetUri?: string | null;
        };
        content?: {
          runtime?: number | null;
          attributes?: Array<{
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
type StreamMode = "auto" | "direct" | "transcode";

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
  seeders?: number | null;
  leechers?: number | null;
  magnetUri?: string | null;
  runtimeSeconds?: number;
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

const STATUS_POLL_MS = 2500;
const BOOTSTRAP_RETRY_MS = 1800;
const BOOTSTRAP_MAX_WAIT_MS = 120000;
const defaultTranscodePreferredExtensions = new Set([
  ".mkv",
  ".avi",
  ".flv",
  ".wmv",
  ".rm",
  ".rmvb",
  ".ts",
  ".m2ts",
  ".mpeg",
  ".mpg",
  ".vob",
  ".mxf",
  ".divx",
  ".xvid",
  ".3gp",
  ".3g2",
  ".f4v"
]);
const browserNativeVideoExtensions = new Set([".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".mov"]);
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

function normalizeExtensionList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of values) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) continue;
    const ext = value.startsWith(".") ? value : `.${value}`;
    if (seen.has(ext)) continue;
    seen.add(ext);
    normalized.push(ext);
  }
  return normalized;
}

function fileExtension(name: string): string {
  const target = String(name || "").trim().toLowerCase();
  if (!target.includes(".")) return "";
  const ext = target.slice(target.lastIndexOf("."));
  return ext.length <= 12 ? ext : "";
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

function buildPlaybackFileOptions(files: PlayerTransmissionFile[]): PlaybackFileOption[] {
  const videos = files.filter((file) => file.isVideo);
  const source = videos.length > 0 ? videos : files;
  const options = source
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

function shouldAutoPreferTranscodeForFile(name: string, enabled: boolean, preferredExtensions: string[]): boolean {
  if (!enabled) return false;
  const ext = fileExtension(name);
  if (!ext) return false;
  if (preferredExtensions.includes(ext)) return true;
  return defaultTranscodePreferredExtensions.has(ext) || !browserNativeVideoExtensions.has(ext);
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

export function TorrentPlayerPage({ infoHash: routeInfoHash }: { infoHash: string }) {
  const { t } = useI18n();
  const infoHash = routeInfoHash.trim().toLowerCase();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerStageRef = useRef<HTMLDivElement | null>(null);
  const inlineSettingsRef = useRef<HTMLDivElement | null>(null);
  const plyrRef = useRef<PlyrLike | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const transcodeSeekInFlightRef = useRef(false);
  const pendingTranscodeSeekDisplayRef = useRef<{ target: number; at: number } | null>(null);
  const isSeekingDragRef = useRef(false);
  const subtitleBlobUrlsRef = useRef<string[]>([]);
  const initializedInfoHashRef = useRef("");
  const selectedFileIndexRef = useRef(-1);
  const streamApplyOptionsRef = useRef<{ resumeAt?: number; autoplay?: boolean }>({});
  const activePreferTranscodeRef = useRef(false);
  const totalDurationSecondsRef = useRef(0);
  const transcodeStartOffsetRef = useRef(0);
  const seekingSwitchingRef = useRef(false);
  const subtitleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const streamModeRef = useRef<StreamMode>("auto");
  const transcodeEnabledRef = useRef(false);
  const tRef = useRef(t);
  const logWarnRef = useRef<(step: string, message: string, details?: unknown) => void>(() => { });
  const bootstrapRunTokenRef = useRef(0);
  const pendingResumeTargetRef = useRef<number | null>(null);
  const autoResumeWhenPlayableRef = useRef(false);

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
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [isSeekingDrag, setIsSeekingDrag] = useState(false);
  const [seekDraftSeconds, setSeekDraftSeconds] = useState<number | null>(null);
  const [videoFitMode, setVideoFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [transcodeStartOffsetSeconds, setTranscodeStartOffsetSeconds] = useState(0);
  const [statusSnapshot, setStatusSnapshot] = useState<PlayerTransmissionStatusResponse | null>(null);
  const [fileOptions, setFileOptions] = useState<PlaybackFileOption[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);

  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  const [transcodePreferredExtensions, setTranscodePreferredExtensions] = useState<string[]>([]);
  const [streamMode, setStreamMode] = useState<StreamMode>("auto");

  const [subtitleItems, setSubtitleItems] = useState<PlayerSubtitleItem[]>([]);
  const [subtitleTrackSrcMap, setSubtitleTrackSrcMap] = useState<Record<number, string>>({});
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("none");
  const [subtitleScale] = useState(1);
  const [subtitleManagerOpened, setSubtitleManagerOpened] = useState(false);
  const [diagnosticsOpened, setDiagnosticsOpened] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);

  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);

  const applyFileOptions = useCallback((nextOptions: PlaybackFileOption[]) => {
    setFileOptions((current) => {
      const currentSignature = current.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      const nextSignature = nextOptions.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      return currentSignature === nextSignature ? current : nextOptions;
    });
  }, []);

  const applyTranscodePreferredExtensions = useCallback((nextValues: string[]) => {
    setTranscodePreferredExtensions((current) => {
      if (current.length === nextValues.length && current.every((value, index) => value === nextValues[index])) {
        return current;
      }
      return nextValues;
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
    isSeekingDragRef.current = isSeekingDrag;
  }, [isSeekingDrag]);

  useEffect(() => {
    return () => {
      for (const entry of subtitleBlobUrlsRef.current) {
        if (entry.startsWith("blob:")) {
          URL.revokeObjectURL(entry);
        }
      }
      subtitleBlobUrlsRef.current = [];
      initializedInfoHashRef.current = "";
      bootstrapRunTokenRef.current += 1;
    };
  }, []);

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

  const streamModeOptions = useMemo(
    () => [
      { value: "auto", label: t("media.player.streamModeAuto") },
      { value: "direct", label: t("media.player.streamModeDirect") },
      { value: "transcode", label: t("media.player.streamModeTranscode") }
    ],
    [t]
  );

  const playbackRateOptions = useMemo(() => [0.5, 0.75, 1, 1.25, 1.5, 2], []);

  const selectedFileOption = useMemo(
    () => fileOptions.find((item) => item.index === selectedFileIndex) || null,
    [fileOptions, selectedFileIndex]
  );

  const resolvePreferTranscode = useCallback(
    (mode: StreamMode, fileName: string): boolean => {
      if (!transcodeEnabled) return false;
      if (mode === "transcode") return true;
      if (mode === "direct") return false;
      return shouldAutoPreferTranscodeForFile(fileName, transcodeEnabled, transcodePreferredExtensions);
    },
    [transcodeEnabled, transcodePreferredExtensions]
  );

  const activePreferTranscode = useMemo(
    () => (selectedFileOption ? resolvePreferTranscode(streamMode, selectedFileOption.name) : false),
    [resolvePreferTranscode, selectedFileOption, streamMode]
  );

  const totalDurationSeconds = useMemo(() => {
    const meta = detail?.runtimeSeconds || 0;
    const media = Number.isFinite(videoDuration) ? Math.max(0, videoDuration) : 0;
    return Math.max(meta, media);
  }, [detail?.runtimeSeconds, videoDuration]);

  const canInitializePlyr =
    !bootstrapLoading &&
    bootstrapped &&
    fileOptions.length > 0 &&
    selectedFileIndex >= 0 &&
    Boolean(selectedFileOption) &&
    Boolean(streamUrl);

  const resolveAbsoluteCurrent = useCallback(() => {
    const video = videoRef.current;
    if (!video) return Math.max(0, absoluteCurrentSeconds);
    const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
    if (activePreferTranscodeRef.current) {
      return transcodeStartOffsetRef.current + nativeCurrent;
    }
    return nativeCurrent;
  }, [absoluteCurrentSeconds]);

  const attemptResumePlayback = useCallback((reason: string, targetSeconds?: number) => {
    const video = videoRef.current;
    if (!video) return;

    const pendingTarget = Number.isFinite(targetSeconds) ? Math.max(0, Number(targetSeconds)) : resolveAbsoluteCurrent();
    pendingResumeTargetRef.current = pendingTarget;
    autoResumeWhenPlayableRef.current = true;
    setPlaybackLoading(true);
    setPlayerStatus("buffering");

    const player = plyrRef.current;
    const playResult = player?.play ? player.play() : video.play();
    void Promise.resolve(playResult).catch(() => {
      logInfo("playback", "waiting for playable data", { reason, targetSeconds: pendingTarget });
    });
  }, [logInfo, resolveAbsoluteCurrent]);

  useEffect(() => {
    activePreferTranscodeRef.current = activePreferTranscode;
  }, [activePreferTranscode]);

  useEffect(() => {
    streamModeRef.current = streamMode;
  }, [streamMode]);

  useEffect(() => {
    transcodeEnabledRef.current = transcodeEnabled;
  }, [transcodeEnabled]);

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

    const offsetSeconds = activePreferTranscode ? Math.max(0, transcodeStartOffsetSeconds) : 0;
    if (offsetSeconds < 0.1) {
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
        try {
          const response = await fetch(baseUrl, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`subtitle http ${response.status}`);
          }
          const raw = await response.text();
          const shifted = shiftWebVttByOffset(raw, offsetSeconds);
          const blobUrl = URL.createObjectURL(new Blob([shifted], { type: "text/vtt" }));
          next[item.id] = blobUrl;
          nextBlobUrls.push(blobUrl);
        } catch (error) {
          next[item.id] = baseUrl;
          logWarn("subtitle", "failed to build shifted subtitle source", {
            subtitleId: item.id,
            offsetSeconds,
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
  }, [activePreferTranscode, totalDurationSeconds, transcodeStartOffsetSeconds]);

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
        if (!wasPaused && video.paused) {
          void video.play().catch(() => {
            // ignore autoplay rejection
          });
        }
        return;
      } catch {
        // fallback to native text track toggling below
      }
    }

    if (!wasPaused && video.paused) {
      void video.play().catch(() => {
        // ignore autoplay rejection
      });
    }
  }, [selectedSubtitleId, subtitleItems]);

  const applyStreamUrl = useCallback((url: string, options?: { resumeAt?: number; autoplay?: boolean }) => {
    streamApplyOptionsRef.current = options || {};
    setStreamUrl(url);
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
    setSubtitleLoading(true);
    try {
      const items = await fetchPlayerSubtitles(infoHash);
      setSubtitleItems(items);
      logInfo("subtitle", "subtitle list loaded", { count: items.length });
    } catch (error) {
      const message = toErrorMessage(error, t("media.player.subtitleUploadFailed"));
      logWarn("subtitle", "failed to load subtitles", { message });
    } finally {
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
        setDetail({
          infoHash: item.infoHash,
          title: item.title || item.torrent.name,
          seeders: item.seeders,
          leechers: item.leechers,
          magnetUri: item.torrent.magnetUri || null,
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

        const options = buildPlaybackFileOptions(result.status.files || []);
        if (options.length === 0) {
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

        setStatusSnapshot(result.status);
        applyFileOptions(options);
        setTranscodeEnabled(Boolean(result.transcodeEnabled));
        applyTranscodePreferredExtensions(normalizeExtensionList(result.transcodePreferredExtensions));

        const selected = options.find((item) => item.index === result.selectedFileIndex) || options[0]!;
        setSelectedFileIndex(selected.index);

        const preferTranscode = resolvePreferTranscode("auto", selected.name);
        const nextUrl = buildPlayerTransmissionStreamURL(
          infoHash,
          selected.index,
          String(Date.now()),
          preferTranscode ? { transcode: true } : undefined
        );
        setTranscodeStartOffsetSeconds(0);
        transcodeStartOffsetRef.current = 0;
        pendingTranscodeSeekDisplayRef.current = null;
        applyStreamUrl(nextUrl, { autoplay: false });

        setBootstrapped(true);
        setPlayerStatus("ready");
        logInfo("bootstrap", "player bootstrap complete", {
          selectedFileIndex: selected.index,
          files: options.length,
          transcodeEnabled: result.transcodeEnabled,
          preferTranscode
        });
        return;
      }
    } catch (error) {
      if (bootstrapRunTokenRef.current !== runToken) return;
      const message = toErrorMessage(error, t("media.player.loadFailed"));
      setPlayerStatus("error");
      setPlayerError(message);
      logError("bootstrap", "bootstrap failed", { message });
    } finally {
      if (bootstrapRunTokenRef.current === runToken) {
        setBootstrapLoading(false);
      }
    }
  }, [applyFileOptions, applyStreamUrl, applyTranscodePreferredExtensions, infoHash, logError, logInfo, resolvePreferTranscode, t]);

  const handleSelectFile = useCallback(
    async (nextIndex: number, source: "panel" | "plyr") => {
      if (!infoHash || !Number.isInteger(nextIndex) || nextIndex < 0) return;
      if (selectedFileIndexRef.current === nextIndex) return;

      setFileSwitching(true);
      try {
        const resumeAt = Math.max(0, Number(videoRef.current?.currentTime || 0));
        const result = await selectPlayerTransmissionFile(infoHash, nextIndex);
        const options = buildPlaybackFileOptions(result.status.files || []);
        applyFileOptions(options);
        setStatusSnapshot(result.status);
        setTranscodeEnabled(Boolean(result.transcodeEnabled));
        const preferredExtensions = normalizeExtensionList(result.transcodePreferredExtensions);
        applyTranscodePreferredExtensions(preferredExtensions);

        const selected = options.find((item) => item.index === result.selectedFileIndex) || options[0];
        if (!selected) throw new Error(t("media.player.noVideoFiles"));

        setSelectedFileIndex(selected.index);

        const preferTranscode =
          streamMode === "transcode"
            ? true
            : streamMode === "direct"
              ? false
              : shouldAutoPreferTranscodeForFile(selected.name, Boolean(result.transcodeEnabled), preferredExtensions);

        const nextUrl = buildPlayerTransmissionStreamURL(
          infoHash,
          selected.index,
          String(Date.now()),
          preferTranscode ? { transcode: true } : undefined
        );
        setTranscodeStartOffsetSeconds(0);
        transcodeStartOffsetRef.current = 0;
        pendingTranscodeSeekDisplayRef.current = null;
        pendingResumeTargetRef.current = preferTranscode ? 0 : resumeAt;
        autoResumeWhenPlayableRef.current = true;
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
        applyStreamUrl(nextUrl, {
          autoplay: true,
          resumeAt: preferTranscode ? 0 : resumeAt
        });

        logInfo("stream", "playback file switched", {
          source,
          selectedFileIndex: selected.index,
          preferTranscode
        });
      } catch (error) {
        const message = toErrorMessage(error, t("media.player.playbackError"));
        notifications.show({ color: "red", message });
        setPlayerError(message);
        setPlayerStatus("error");
        logError("stream", "failed to switch playback file", { message, source, nextIndex });
      } finally {
        setFileSwitching(false);
      }
    },
    [applyFileOptions, applyStreamUrl, applyTranscodePreferredExtensions, infoHash, logError, logInfo, streamMode, t]
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
    if (!bootstrapped || !infoHash) return;

    const runPoll = async () => {
      try {
        const next = await fetchPlayerTransmissionStatus(infoHash);
        setStatusSnapshot(next);
        const options = buildPlaybackFileOptions(next.files || []);
        if (options.length > 0) {
          applyFileOptions(options);
        }
        if (Number.isInteger(next.selectedFileIndex) && next.selectedFileIndex >= 0) {
          setSelectedFileIndex(next.selectedFileIndex);
        }
      } catch (error) {
        logWarn("status", "poll status failed", { message: toErrorMessage(error, "poll failed") });
      }
    };

    void runPoll();
    pollTimerRef.current = window.setInterval(() => {
      void runPoll();
    }, STATUS_POLL_MS);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [applyFileOptions, bootstrapped, infoHash, logWarn]);

  useEffect(() => {
    if (!bootstrapped || !infoHash || selectedFileIndex < 0 || fileOptions.length === 0) return;
    const selected = fileOptions.find((item) => item.index === selectedFileIndex);
    if (!selected) return;

    const preferTranscode = resolvePreferTranscode(streamMode, selected.name);
    const resumeAt = Math.max(0, Number(videoRef.current?.currentTime || 0));
    const nextUrl = buildPlayerTransmissionStreamURL(
      infoHash,
      selectedFileIndex,
      `${selectedFileIndex}-${streamMode}-${preferTranscode ? "tc" : "direct"}`,
      preferTranscode ? { transcode: true } : undefined
    );

    setTranscodeStartOffsetSeconds(0);
    transcodeStartOffsetRef.current = 0;
    pendingTranscodeSeekDisplayRef.current = null;
    pendingResumeTargetRef.current = preferTranscode ? 0 : resumeAt;
    autoResumeWhenPlayableRef.current = true;
    setPlaybackLoading(true);
    setPlayerStatus("buffering");
    applyStreamUrl(nextUrl, {
      autoplay: true,
      resumeAt: preferTranscode ? 0 : resumeAt
    });

    logInfo("stream", "stream mode updated", {
      mode: streamMode,
      selectedFileIndex,
      preferTranscode
    });
  }, [
    applyStreamUrl,
    bootstrapped,
    fileOptions,
    infoHash,
    logInfo,
    resolvePreferTranscode,
    selectedFileIndex,
    streamMode
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

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
      syncSelectedSubtitleTrack();
      if (autoplay) {
        attemptResumePlayback("stream_loadedmetadata", resumeAt > 0 ? resumeAt : undefined);
      } else {
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        setPlayerStatus("ready");
      }
      emitTimelineRefreshEvents();
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.load();
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [attemptResumePlayback, emitTimelineRefreshEvents, streamUrl, syncSelectedSubtitleTrack]);

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
      }

      const durationSeconds = Number.isFinite(video.duration) ? Math.max(0, Number(video.duration)) : 0;
      if (Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds < 1e7) {
        setVideoDuration(durationSeconds);
      }
      const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
      const pendingDisplay = pendingTranscodeSeekDisplayRef.current;
      const absoluteCurrent =
        activePreferTranscodeRef.current && pendingDisplay && (transcodeSeekInFlightRef.current || Date.now() - pendingDisplay.at < 2400)
          ? pendingDisplay.target
          : activePreferTranscodeRef.current
            ? transcodeStartOffsetRef.current + nativeCurrent
            : nativeCurrent;
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
    const video = videoRef.current;
    if (!video) return;

    const resumeIfPending = () => {
      if (!autoResumeWhenPlayableRef.current) return;
      const player = plyrRef.current;
      const playResult = player?.play ? player.play() : video.play();
      void Promise.resolve(playResult).catch(() => {
        // keep pending and wait for more buffered data
      });
    };

    const onWaiting = () => {
      setPlaybackLoading(true);
      setPlayerStatus("buffering");
    };

    const onCanPlay = () => {
      resumeIfPending();
      if (!autoResumeWhenPlayableRef.current && !video.paused) {
        setPlaybackLoading(false);
      }
    };

    const onPlaying = () => {
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      setPlaybackLoading(false);
      setPlayerStatus("playing");
    };

    const onPause = () => {
      if (!autoResumeWhenPlayableRef.current) {
        setPlaybackLoading(false);
      }
    };

    const onError = () => {
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      setPlaybackLoading(false);
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
  }, []);

  useEffect(() => {
    if (!statusSnapshot || !autoResumeWhenPlayableRef.current) return;
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
    if (selectedSubtitleId === "none") return;
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
        clickToPlay: true,
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
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        setPlayerStatus("playing");
      });

      localPlayer.on("waiting", () => {
        if (cancelled) return;
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
      });

      localPlayer.on("error", () => {
        if (cancelled) return;
        transcodeSeekInFlightRef.current = false;
        seekingSwitchingRef.current = false;
        pendingTranscodeSeekDisplayRef.current = null;
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        setPlayerStatus("error");

        if (transcodeEnabledRef.current && streamModeRef.current !== "transcode") {
          setStreamMode("transcode");
          notifications.show({
            color: "yellow",
            message: tRef.current("media.player.autoRetrying")
          });
          logWarnRef.current("plyr", "playback error, fallback to transcode mode");
          return;
        }

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
  }, [canInitializePlyr, emitTimelineRefreshEvents]);

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
        if (activePreferTranscode) {
          releaseOnLoadedMetadata = true;
          transcodeSeekInFlightRef.current = true;
          pendingTranscodeSeekDisplayRef.current = { target: clamped, at: Date.now() };
          pendingResumeTargetRef.current = clamped;
          autoResumeWhenPlayableRef.current = true;
          setPlaybackLoading(true);
          setPlayerStatus("buffering");
          setAbsoluteCurrentSeconds(clamped);
          const startBytes = estimateTranscodeStartBytes(clamped, fullDuration, selectedFileOption.length);
          const seekUrl = buildPlayerTransmissionStreamURL(
            infoHash,
            selectedFileOption.index,
            `seek-${selectedFileOption.index}-${Math.floor(clamped * 10)}`,
            {
              transcode: true,
              startSeconds: clamped,
              startBytes
            }
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
      infoHash,
      logInfo,
      logWarn,
      selectedFileOption,
      setPlaybackLoading,
      setPlayerStatus,
      t,
      totalDurationSeconds,
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
    const isPaused = typeof player?.paused === "boolean" ? player.paused : video.paused;
    if (isPaused) {
      attemptResumePlayback("toggle_play");
      return;
    }
    autoResumeWhenPlayableRef.current = false;
    pendingResumeTargetRef.current = null;
    setPlaybackLoading(false);
    if (player?.pause) {
      player.pause();
      return;
    }
    video.pause();
  }, [attemptResumePlayback]);

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
    const player = plyrRef.current;
    if (player?.fullscreen?.toggle) {
      try {
        player.fullscreen.toggle();
        return;
      } catch {
        // fallback to native request below
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

  const totalTimelineSeconds = Math.max(totalDurationSeconds, videoDuration, absoluteCurrentSeconds);
  const seekMax = totalTimelineSeconds > 0 ? totalTimelineSeconds : 1;
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

  const stageBootstrapLoading = !canInitializePlyr && !playerError;
  const readyRatio = Math.round((statusSnapshot?.selectedFileReadyRatio || 0) * 100);
  const contiguousRatio = Math.round((statusSnapshot?.selectedFileContiguousRatio || 0) * 100);
  const playedRatio = Math.max(0, Math.min(1, seekMax > 0 ? displayedCurrentSeconds / seekMax : 0));
  const playerStageStyle: CSSProperties = {
    ["--torrent-subtitle-scale" as string]: String(subtitleScale),
    ["--torrent-video-object-fit" as string]: videoFitMode,
    ["--torrent-player-aspect-ratio" as string]: videoAspectRatioCss,
    ["--torrent-player-aspect-ratio-value" as string]: String(videoAspectRatioValue),
    ["--torrent-player-height-offset" as string]: isFullscreenActive ? "132px" : "340px"
  };
  const showPlaybackBusyOverlay =
    !stageBootstrapLoading &&
    (playbackLoading || fileSwitching || playerStatus === "buffering");

  return (
    <Stack gap="md" className="torrent-player-page">
      {detail ? (
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Text size="lg" fw={700}>{detail.title}</Text>
            <Text c="dimmed" size="sm" className="detail-code-line">
              <a href={detail.magnetUri || ""} rel="noreferrer" target="_blank">{detail.infoHash}</a>
            </Text>
            <Group gap="xs" mt={8}>
              <Badge variant="outline">{statusToLabel(playerStatus, t)}</Badge>
              <Badge variant="outline">{t("media.player.progress")}: {Math.round((statusSnapshot?.progress || 0) * 100)}%</Badge>
              <Badge variant="outline">{t("media.player.downloadSpeed")}: {formatSpeed(statusSnapshot?.downloadRate || 0)}</Badge>
              <Badge variant="outline">{t("media.player.peers")}: {statusSnapshot?.peersConnected || 0}</Badge>
              <Badge variant="outline">{t("media.player.fileReadyLabel")}: {readyRatio}%</Badge>
              <Badge variant="outline">{t("media.player.contiguousLabel")}: {contiguousRatio}%</Badge>
              <Badge variant="light">Seeders: {detail.seeders ?? 0}</Badge>
              <Badge variant="light">Leechers: {detail.leechers ?? 0}</Badge>
            </Group>
          </div>
          <Tooltip label={t("media.player.diagnosticsTitle")} withArrow>
            <ActionIcon
              className="app-icon-btn"
              variant="default"
              size="lg"
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
            className={`torrent-player-stage-shell${isVideoPaused ? " is-paused" : ""}${isFullscreenActive ? " is-fullscreen" : ""}`}
          >
            <div className="torrent-player-wrap torrent-player-plyr-wrap" style={playerStageStyle}>
              <video
                ref={videoRef}
                src={streamUrl || undefined}
                className="torrent-player-video torrent-plyr"
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
              >
                {subtitleItems.map((item) => (
                  <track
                    key={`${item.id}:${item.updatedAt}`}
                    kind="subtitles"
                    label={item.label || `Subtitle ${item.id}`}
                    srcLang={normalizeSubtitleLanguage(item.language)}
                    src={subtitleTrackSrcMap[item.id] || buildPlayerSubtitleContentURL(infoHash, item.id, item.updatedAt)}
                    default={false}
                  />
                ))}
              </video>
            </div>
            {showPlaybackBusyOverlay ? (
              <div className="torrent-player-buffering-overlay">
                <Stack gap={6} align="center">
                  <Loader size="sm" />
                  <Text fw={600} size="sm">{t("media.player.waitingPlayableTitle")}</Text>
                  <Text c="dimmed" size="xs">{t("media.player.waitingPlayableHint")}</Text>
                </Stack>
              </div>
            ) : null}

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

                <div className="torrent-inline-seek-shell">
                  <div className="torrent-inline-seek-track">
                    <div className="torrent-inline-seek-downloaded" style={{ width: `${readyRatio}%` }} />
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
                        ? "画面模式：等比完整显示（点击切换）"
                        : videoFitMode === "cover"
                          ? "画面模式：铺满裁切（点击切换）"
                          : "画面模式：拉伸铺满（点击切换）"
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
                          <div className="torrent-inline-settings-title">Playback Speed</div>
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
                          <div className="torrent-inline-settings-title">{t("media.player.subtitleTrack")}</div>
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
                          <button
                            type="button"
                            className="torrent-inline-manage-btn"
                            onClick={() => {
                              setSettingsOpen(false);
                              setSubtitleManagerOpened(true);
                            }}
                          >
                            {t("media.player.subtitleManage")}
                          </button>
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
                    title="PiP"
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

              <Select
                label={t("media.player.streamMode")}
                data={streamModeOptions}
                value={streamMode}
                onChange={(value) => {
                  if (value === "auto" || value === "direct" || value === "transcode") {
                    setStreamMode(value);
                  }
                }}
                disabled={!transcodeEnabled}
              />
            </div>

            <Group gap="xs">
              <Badge variant="outline">{t("media.player.resolution")}: {fileOptions.find((item) => item.index === selectedFileIndex)?.resolutionLabel || "-"}</Badge>
              <Badge variant="outline">{t("media.player.streamingModeHint")}</Badge>
              <Badge variant="outline">{t("media.player.sequentialDownloadLabel")}: {statusSnapshot?.sequentialDownload ? t("media.player.sequentialDownloadOn") : t("media.player.sequentialDownloadOff")}</Badge>
            </Group>
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

      <Modal
        opened={subtitleManagerOpened}
        onClose={() => setSubtitleManagerOpened(false)}
        title={t("media.player.subtitleManagerTitle")}
        size="lg"
      >
        <Stack gap="md">
          <Group justify="space-between" align="center">
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
                    <Text fw={700} size="sm" className="torrent-subtitle-item-title">
                      {item.label || `Subtitle ${item.id}`}
                    </Text>
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
                </div>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}

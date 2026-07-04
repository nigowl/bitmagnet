"use client";

import { useMemo, type CSSProperties } from "react";
import { formatDateTimeOrRaw } from "@/lib/datetime";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type TorrentDetailLite = player.TorrentDetailLite;
type PlaybackFileOption = player.PlaybackFileOption;
type PlayerStatus = player.PlayerStatus;
type SubtitleStylePreset = player.SubtitleStylePreset;

type UseTorrentPlayerViewModelArgs = {
  t: TFunction;
  detail: TorrentDetailLite | null;
  playerError: string | null;
  canInitializePlayer: boolean;
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  selectedFileOption: PlaybackFileOption | null;
  transcodeOutputResolution: number;
  activePreferTranscode: boolean;
  networkCacheSeconds: number;
  prebufferProgressSeconds: number;
  playerStatus: PlayerStatus;
  isVideoPaused: boolean;
  displayedCurrentSeconds: number;
  seekMax: number;
  authoritativeDurationSeconds: number;
  knownTimelineSeconds: number;
  formatClock: (seconds: number) => string;
  fileSwitching: boolean;
  playbackLoading: boolean;
  playableCacheAheadSeconds: number;
  settingsOpen: boolean;
  subtitleManagerOpened: boolean;
  resumePromptOpened: boolean;
  isSeekingDrag: boolean;
  isFullscreenActive: boolean;
  subtitleStylePreset: SubtitleStylePreset;
  videoFitMode: "contain" | "cover" | "fill";
  videoAspectRatioCss: string;
  videoAspectRatioValue: number;
};

export function useTorrentPlayerViewModel({
  t,
  detail,
  playerError,
  canInitializePlayer,
  statusSnapshot,
  selectedFileOption,
  transcodeOutputResolution,
  activePreferTranscode,
  networkCacheSeconds,
  prebufferProgressSeconds,
  playerStatus,
  isVideoPaused,
  displayedCurrentSeconds,
  seekMax,
  authoritativeDurationSeconds,
  knownTimelineSeconds,
  formatClock,
  fileSwitching,
  playbackLoading,
  playableCacheAheadSeconds,
  settingsOpen,
  subtitleManagerOpened,
  resumePromptOpened,
  isSeekingDrag,
  isFullscreenActive,
  subtitleStylePreset,
  videoFitMode,
  videoAspectRatioCss,
  videoAspectRatioValue
}: UseTorrentPlayerViewModelArgs) {
  const stageBootstrapLoading = !canInitializePlayer && !playerError;
  const downloadedRatio = Math.round((statusSnapshot?.selectedFileReadyRatio || 0) * 100);
  const contiguousRatio = Math.round((statusSnapshot?.selectedFileContiguousRatio || 0) * 100);
  const { playableRatio, availableRanges } = useMemo(() => {
    const merged = player.normalizePlayableRanges(statusSnapshot);
    if (merged.length === 0) {
      return {
        playableRatio: 0,
        availableRanges: [] as Array<{ start: number; end: number }>
      };
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
  }, [statusSnapshot]);

  const playedRatio = Math.max(0, Math.min(1, seekMax > 0 ? displayedCurrentSeconds / seekMax : 0));
  const sourceResolutionLabel = selectedFileOption?.resolutionLabel || "-";
  const outputResolutionLabel = transcodeOutputResolution > 0 ? `${transcodeOutputResolution}p` : t("media.player.resolutionOutputOriginal");
  const networkCacheLabel = `${player.formatSecondsCounter(activePreferTranscode ? networkCacheSeconds : prebufferProgressSeconds)} ${t("media.player.prebufferSeconds")}`;
  const playbackStatusLabel =
    isVideoPaused && (playerStatus === "playing" || playerStatus === "ready")
      ? t("media.player.statusPaused")
      : player.statusToLabel(playerStatus, t);
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
  const detailPublishedLabel = detail?.publishedAt ? formatDateTimeOrRaw(detail.publishedAt) : "";
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
    ["--torrent-subtitle-font-size" as string]: `${player.resolveRenderedSubtitleFontSize(subtitleStylePreset.scale)}px`,
    ["--torrent-subtitle-line-height" as string]: String(player.resolveRenderedSubtitleLineHeight(subtitleStylePreset.scale)),
    ["--torrent-subtitle-color" as string]: subtitleStylePreset.textColor,
    ["--torrent-subtitle-bg" as string]: subtitleStylePreset.backgroundColor,
    ["--torrent-subtitle-vertical-percent" as string]: `${subtitleStylePreset.verticalPercent}%`,
    ["--torrent-video-object-fit" as string]: videoFitMode,
    ["--torrent-player-aspect-ratio" as string]: videoAspectRatioCss,
    ["--torrent-player-aspect-ratio-value" as string]: String(videoAspectRatioValue),
    ["--torrent-player-height-offset" as string]: isFullscreenActive ? "132px" : "340px"
  };
  const subtitleOverlayStyle: CSSProperties = {
    fontSize: `${player.resolveRenderedSubtitleFontSize(subtitleStylePreset.scale)}px`,
    lineHeight: player.resolveRenderedSubtitleLineHeight(subtitleStylePreset.scale),
    color: subtitleStylePreset.textColor,
    backgroundColor: subtitleStylePreset.backgroundColor,
    bottom: `calc(54px + ${subtitleStylePreset.verticalPercent}%)`
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

  return {
    stageBootstrapLoading,
    downloadedRatio,
    contiguousRatio,
    playableRatio,
    availableRanges,
    playedRatio,
    sourceResolutionLabel,
    outputResolutionLabel,
    networkCacheLabel,
    playbackStatusLabel,
    downloadTaskProgress,
    isDownloadComplete,
    isDownloading,
    transferStatusLabel,
    playbackPositionLabel,
    detailPublishedLabel,
    detailTagPreview,
    detailSourceLabel,
    mediaTitleDisplay,
    playerStageStyle,
    subtitleOverlayStyle,
    showPlaybackBusyOverlay,
    shouldKeepInlineControlsVisible
  };
}

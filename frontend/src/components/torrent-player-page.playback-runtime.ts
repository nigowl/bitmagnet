"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import { playNativeVideo } from "@/lib/player/native-media";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerPlaybackRuntimeArgs = {
  infoHash: string;
  selectedFileIndex: number;
  activePreferTranscode: boolean;
  streamUrl: string;
  totalDurationSeconds: number;
  transcodeStartOffsetSeconds: number;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  absoluteCurrentSecondsRef: MutableRefObject<number>;
  activePreferTranscodeRef: MutableRefObject<boolean>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  selectedFileIndexRef: MutableRefObject<number>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  totalDurationSecondsRef: MutableRefObject<number>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  logInfo: LogFn;
  setIsVideoPaused: Dispatch<SetStateAction<boolean>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setVideoDuration: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerPlaybackRuntime({
  infoHash,
  selectedFileIndex,
  activePreferTranscode,
  streamUrl,
  totalDurationSeconds,
  transcodeStartOffsetSeconds,
  videoRef,
  absoluteCurrentSecondsRef,
  activePreferTranscodeRef,
  autoResumeWhenPlayableRef,
  pendingResumeTargetRef,
  selectedFileIndexRef,
  statusSnapshotRef,
  totalDurationSecondsRef,
  transcodeStartOffsetRef,
  userPausedRef,
  logInfo,
  setIsVideoPaused,
  setPlaybackLoading,
  setPlayerStatus,
  setVideoDuration
}: UseTorrentPlayerPlaybackRuntimeArgs) {
  const resolveAbsoluteCurrent = useCallback(() => {
    const video = videoRef.current;
    if (!video) return Math.max(0, absoluteCurrentSecondsRef.current);
    const nativeCurrent = Number.isFinite(video.currentTime) ? Math.max(0, Number(video.currentTime)) : 0;
    if (activePreferTranscodeRef.current) {
      return transcodeStartOffsetRef.current + nativeCurrent;
    }
    return nativeCurrent;
  }, [absoluteCurrentSecondsRef, activePreferTranscodeRef, transcodeStartOffsetRef, videoRef]);

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
  }, [videoRef]);

  const resolveBufferedAheadSeconds = useCallback(() => resolveBufferedAheadAtSeconds(), [resolveBufferedAheadAtSeconds]);

  const resolveHLSNetworkCacheAheadSeconds = useCallback(() => {
    if (!activePreferTranscodeRef.current) return 0;
    return resolveBufferedAheadSeconds();
  }, [activePreferTranscodeRef, resolveBufferedAheadSeconds]);

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
  }, [
    activePreferTranscodeRef,
    resolveAbsoluteCurrent,
    resolveBufferedAheadSeconds,
    selectedFileIndexRef,
    statusSnapshotRef,
    totalDurationSecondsRef
  ]);

  const settlePausedPlayback = useCallback((status: PlayerStatus = "ready") => {
    autoResumeWhenPlayableRef.current = false;
    pendingResumeTargetRef.current = null;
    setPlaybackLoading(false);
    setPlayerStatus(status);
    setIsVideoPaused(true);
  }, [autoResumeWhenPlayableRef, pendingResumeTargetRef, setIsVideoPaused, setPlaybackLoading, setPlayerStatus]);

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

    const playResult = playNativeVideo(video);
    void Promise.resolve(playResult).catch((error) => {
      const errorName = error instanceof DOMException ? error.name : "";
      logInfo("playback", "waiting for playable data", { reason, targetSeconds: pendingTarget, errorName });
      if (errorName === "AbortError") {
        if (userPausedRef.current) {
          settlePausedPlayback();
        }
        return;
      }
      if (video.paused && errorName === "NotAllowedError") {
        settlePausedPlayback();
      }
    });
  }, [
    autoResumeWhenPlayableRef,
    logInfo,
    pendingResumeTargetRef,
    resolveAbsoluteCurrent,
    settlePausedPlayback,
    setPlaybackLoading,
    setPlayerStatus,
    userPausedRef,
    videoRef
  ]);

  useEffect(() => {
    activePreferTranscodeRef.current = activePreferTranscode;
  }, [activePreferTranscode, activePreferTranscodeRef]);

  useEffect(() => {
    setVideoDuration(0);
  }, [infoHash, selectedFileIndex, setVideoDuration]);

  useEffect(() => {
    totalDurationSecondsRef.current = totalDurationSeconds;
  }, [totalDurationSeconds, totalDurationSecondsRef]);

  useEffect(() => {
    transcodeStartOffsetRef.current = transcodeStartOffsetSeconds;
  }, [transcodeStartOffsetSeconds, transcodeStartOffsetRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
  }, [activePreferTranscode, streamUrl, totalDurationSeconds, transcodeStartOffsetSeconds, videoRef]);

  return {
    attemptResumePlayback,
    resolveAbsoluteCurrent,
    resolveBufferedAheadAtSeconds,
    resolveBufferedAheadSeconds,
    resolveCachedAheadSeconds,
    resolveHLSNetworkCacheAheadSeconds,
    settlePausedPlayback
  };
}

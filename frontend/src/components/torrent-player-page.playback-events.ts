"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { pauseNativeVideo, playNativeVideo } from "@/lib/player/native-media";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type HlsLike = player.HlsLike;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerPlaybackEventsArgs = {
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  videoDuration: number;
  resolveAbsoluteCurrent: () => number;
  resolveCachedAheadSeconds: () => number;
  resolveHLSNetworkCacheAheadSeconds: () => number;
  settlePausedPlayback: (status?: PlayerStatus) => void;
  syncSelectedAudioTrack: () => void;
  activePreferTranscodeRef: MutableRefObject<boolean>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  fileSwitchingRef: MutableRefObject<boolean>;
  hlsLastActivityAtRef: MutableRefObject<number>;
  hlsLastFragmentBufferedAtRef: MutableRefObject<number>;
  hlsRef: MutableRefObject<HlsLike | null>;
  hlsReleasedForPauseRef: MutableRefObject<boolean>;
  hlsStartupAtRef: MutableRefObject<number>;
  hlsSuspendedRef: MutableRefObject<boolean>;
  lastAutoRecoveryAtRef: MutableRefObject<number>;
  lastPlaybackProgressRef: MutableRefObject<{ at: number; seconds: number }>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  pauseCurrentHLSLoadRef: MutableRefObject<(paused: boolean) => void>;
  retryCurrentStreamRef: MutableRefObject<(reason: string) => boolean>;
  seekingSwitchingRef: MutableRefObject<boolean>;
  stallStartedAtRef: MutableRefObject<number>;
  streamRetryRef: MutableRefObject<{ key: string; attempts: number }>;
  streamUrlRef: MutableRefObject<string>;
  tRef: MutableRefObject<(key: string) => string>;
  totalDurationSecondsRef: MutableRefObject<number>;
  transcodeSeekInFlightRef: MutableRefObject<boolean>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logWarn: LogFn;
  setIsVideoPaused: Dispatch<SetStateAction<boolean>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
};

export function useTorrentPlayerPlaybackEvents({
  statusSnapshot,
  videoDuration,
  resolveAbsoluteCurrent,
  resolveCachedAheadSeconds,
  resolveHLSNetworkCacheAheadSeconds,
  settlePausedPlayback,
  syncSelectedAudioTrack,
  activePreferTranscodeRef,
  autoResumeWhenPlayableRef,
  fileSwitchingRef,
  hlsLastActivityAtRef,
  hlsLastFragmentBufferedAtRef,
  hlsRef,
  hlsReleasedForPauseRef,
  hlsStartupAtRef,
  hlsSuspendedRef,
  lastAutoRecoveryAtRef,
  lastPlaybackProgressRef,
  pendingResumeTargetRef,
  pendingTranscodeSeekDisplayRef,
  pauseCurrentHLSLoadRef,
  retryCurrentStreamRef,
  seekingSwitchingRef,
  stallStartedAtRef,
  streamRetryRef,
  streamUrlRef,
  tRef,
  totalDurationSecondsRef,
  transcodeSeekInFlightRef,
  userPausedRef,
  videoRef,
  logWarn,
  setIsVideoPaused,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus
}: UseTorrentPlayerPlaybackEventsArgs) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const markPlaybackProgress = (force = false) => {
      const seconds = Math.max(0, resolveAbsoluteCurrent());
      const previous = lastPlaybackProgressRef.current;
      if (
        force ||
        previous.at <= 0 ||
        Math.abs(seconds - previous.seconds) >= player.PLAYBACK_PROGRESS_EPSILON_SECONDS
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
      if (Math.abs(seconds - previous.seconds) >= player.PLAYBACK_PROGRESS_EPSILON_SECONDS) {
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
          startupElapsed < player.HLS_STARTUP_RECOVERY_GRACE_MS ||
          lastActivityElapsed < player.HLS_ACTIVITY_RECOVERY_GRACE_MS ||
          lastFragmentElapsed < player.HLS_ACTIVITY_RECOVERY_GRACE_MS
        ) {
          return;
        }
      }
      const isLikelyStalled =
        autoResumeWhenPlayableRef.current ||
        stallStartedAtRef.current > 0 ||
        noProgressMs >= player.PLAYBACK_STALL_RETRY_MS ||
        video.readyState < video.HAVE_FUTURE_DATA ||
        bufferedAhead < 0.75;
      if (!isLikelyStalled) return;

      const thresholdMs = autoResumeWhenPlayableRef.current ? player.PLAYBACK_STALL_GRACE_MS : player.PLAYBACK_STALL_RETRY_MS;
      if (noProgressMs < thresholdMs && stallMs < thresholdMs) return;
      if (now - lastAutoRecoveryAtRef.current < player.PLAYBACK_RECOVERY_COOLDOWN_MS) return;

      lastAutoRecoveryAtRef.current = now;
      setPlaybackLoading(true);
      setPlayerStatus("buffering");
      if (activePreferTranscodeRef.current && hlsRef.current) {
        autoResumeWhenPlayableRef.current = true;
        pendingResumeTargetRef.current = seconds;
        hlsRef.current.startLoad?.();
        logWarn("stream", "hls playback is waiting for cache", {
          trigger,
          noProgressMs,
          stallMs,
          bufferedAhead,
          readyState: video.readyState,
          currentSeconds: seconds
        });
        return;
      }
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
    }, player.PLAYBACK_STALL_TICK_MS);

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
  }, [
    activePreferTranscodeRef,
    autoResumeWhenPlayableRef,
    hlsLastActivityAtRef,
    hlsLastFragmentBufferedAtRef,
    hlsRef,
    hlsReleasedForPauseRef,
    hlsStartupAtRef,
    hlsSuspendedRef,
    lastAutoRecoveryAtRef,
    lastPlaybackProgressRef,
    logWarn,
    pendingResumeTargetRef,
    resolveAbsoluteCurrent,
    resolveCachedAheadSeconds,
    retryCurrentStreamRef,
    seekingSwitchingRef,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    stallStartedAtRef,
    streamUrlRef,
    tRef,
    totalDurationSecondsRef,
    transcodeSeekInFlightRef,
    userPausedRef,
    videoRef
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resumeIfPending = () => {
      if (userPausedRef.current) return;
      if (!autoResumeWhenPlayableRef.current) return;
      const playResult = playNativeVideo(video);
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
      if (activePreferTranscodeRef.current) {
        autoResumeWhenPlayableRef.current = true;
        pendingResumeTargetRef.current = Math.max(0, resolveAbsoluteCurrent());
        hlsRef.current?.startLoad?.();
      }
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
        pauseNativeVideo(video);
        settlePausedPlayback();
        return;
      }
      if (activePreferTranscodeRef.current && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current)) {
        pauseNativeVideo(video);
        settlePausedPlayback();
        return;
      }
      autoResumeWhenPlayableRef.current = false;
      if (activePreferTranscodeRef.current) {
        pauseCurrentHLSLoadRef.current(false);
      }
      pendingResumeTargetRef.current = null;
      streamRetryRef.current = { key: "", attempts: 0 };
      syncSelectedAudioTrack();
      setPlaybackLoading(false);
      setPlayerStatus("playing");
      setIsVideoPaused(false);
    };

    const onPause = () => {
      if (userPausedRef.current) {
        if (activePreferTranscodeRef.current && !hlsReleasedForPauseRef.current && !seekingSwitchingRef.current && !fileSwitchingRef.current) {
          pauseCurrentHLSLoadRef.current(true);
        }
        settlePausedPlayback();
        return;
      }
      if (!autoResumeWhenPlayableRef.current) {
        if (activePreferTranscodeRef.current && !hlsReleasedForPauseRef.current && !seekingSwitchingRef.current && !fileSwitchingRef.current) {
          pauseCurrentHLSLoadRef.current(true);
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
  }, [
    activePreferTranscodeRef,
    autoResumeWhenPlayableRef,
    fileSwitchingRef,
    hlsReleasedForPauseRef,
    hlsRef,
    hlsSuspendedRef,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    pauseCurrentHLSLoadRef,
    resolveAbsoluteCurrent,
    resolveCachedAheadSeconds,
    resolveHLSNetworkCacheAheadSeconds,
    retryCurrentStreamRef,
    seekingSwitchingRef,
    setIsVideoPaused,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    settlePausedPlayback,
    streamRetryRef,
    syncSelectedAudioTrack,
    tRef,
    transcodeSeekInFlightRef,
    userPausedRef,
    videoRef
  ]);

  useEffect(() => {
    if (!statusSnapshot || !autoResumeWhenPlayableRef.current || userPausedRef.current) return;
    const target = pendingResumeTargetRef.current;
    if (!Number.isFinite(target) || (target || 0) <= 0) return;

    const timeline = Math.max(totalDurationSecondsRef.current, videoDuration, target || 0);
    if (!Number.isFinite(timeline) || timeline <= 0) return;
    const targetRatio = Math.max(0, Math.min(1, (target || 0) / timeline));
    const targetAvailable = player.normalizePlayableRanges(statusSnapshot).some((range) => {
      const end = Math.max(0, range.end * timeline);
      return targetRatio >= range.start && targetRatio <= range.end && end - (target || 0) >= 1;
    });
    if (!targetAvailable) return;

    const video = videoRef.current;
    if (!video) return;
    const playResult = playNativeVideo(video);
    void Promise.resolve(playResult).catch(() => {
      // continue waiting if browser still refuses playback
    });
  }, [
    autoResumeWhenPlayableRef,
    pendingResumeTargetRef,
    statusSnapshot,
    totalDurationSecondsRef,
    userPausedRef,
    videoDuration,
    videoRef
  ]);
}

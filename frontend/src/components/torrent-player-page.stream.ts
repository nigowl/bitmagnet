"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getAuthToken } from "@/lib/api";
import { pauseNativeVideo } from "@/lib/player/native-media";
import {
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionHLSStopURL,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";
import { useTorrentPlayerHlsHeartbeat } from "./torrent-player-page.hls-heartbeat";
import { useTorrentPlayerHlsSession } from "./torrent-player-page.hls-session";

type PlayerStatus = player.PlayerStatus;
type PlaybackFileOption = player.PlaybackFileOption;
type HlsLike = player.HlsLike;
type LogFn = (step: string, message: string, details?: unknown) => void;
type BuildHLSPlaylistOptions = (overrides?: {
  audioTrackIndex?: number;
  startSeconds?: number;
  startBytes?: number;
  durationSeconds?: number;
  prebufferSeconds?: number;
}) => {
  audioTrackIndex: number;
  outputResolution?: number;
  startSeconds?: number;
  startBytes?: number;
  prebufferSeconds: number;
  durationSeconds: number;
};
type ResolvePlayableStart = (
  targetSeconds: number,
  totalDurationSeconds: number,
  file: { length: number },
  status: PlayerTransmissionStatusResponse | null | undefined,
  source: string
) => ReturnType<typeof player.resolvePlayableTranscodeStart>;

type UseTorrentPlayerStreamArgs = {
  infoHash: string;
  streamUrl: string;
  activePreferTranscode: boolean;
  selectedFileIndex: number;
  fileOptions: PlaybackFileOption[];
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  resolveAbsoluteCurrent: () => number;
  resolveHLSNetworkCacheAheadSeconds: () => number;
  settlePausedPlayback: (status?: PlayerStatus) => void;
  buildCurrentPlaybackStreamURL: (cacheTag?: string) => string;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  activePreferTranscodeRef: MutableRefObject<boolean>;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  hlsLastActivityAtRef: MutableRefObject<number>;
  hlsLastFragmentBufferedAtRef: MutableRefObject<number>;
  hlsLastMediaRecoveryAtRef: MutableRefObject<number>;
  hlsRef: MutableRefObject<HlsLike | null>;
  hlsReleasedForPauseRef: MutableRefObject<boolean>;
  hlsStartupAtRef: MutableRefObject<number>;
  hlsSuspendedRef: MutableRefObject<boolean>;
  lastStreamRetryAtRef: MutableRefObject<number>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  playbackLoadingRef: MutableRefObject<boolean>;
  playerStatusRef: MutableRefObject<PlayerStatus>;
  releaseCurrentHLSRef: MutableRefObject<(reason: string, keepalive?: boolean) => void>;
  retryCurrentStreamRef: MutableRefObject<(reason: string) => boolean>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  streamApplyOptionsRef: MutableRefObject<{ resumeAt?: number; autoplay?: boolean; recovery?: boolean; preload?: boolean }>;
  streamRetryRef: MutableRefObject<{ key: string; attempts: number }>;
  streamRetryTimerRef: MutableRefObject<number | null>;
  streamUrlRef: MutableRefObject<string>;
  tRef: MutableRefObject<(key: string) => string>;
  totalDurationSecondsRef: MutableRefObject<number>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logWarn: LogFn;
  logWarnRef: MutableRefObject<LogFn>;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setIsVideoPaused: Dispatch<SetStateAction<boolean>>;
  setNetworkCacheSeconds: Dispatch<SetStateAction<number>>;
  setPlayableCacheAheadSeconds: Dispatch<SetStateAction<number>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setPrebufferProgressSeconds: Dispatch<SetStateAction<number>>;
  setStreamUrl: Dispatch<SetStateAction<string>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerStream({
  infoHash,
  streamUrl,
  activePreferTranscode,
  selectedFileIndex,
  fileOptions,
  transcodeOutputResolution,
  transcodePrebufferSeconds,
  resolveAbsoluteCurrent,
  resolveHLSNetworkCacheAheadSeconds,
  settlePausedPlayback,
  buildCurrentPlaybackStreamURL,
  buildHLSPlaylistOptions,
  resolvePlayableTranscodeStartForFile,
  activePreferTranscodeRef,
  activeStreamConfigKeyRef,
  autoResumeWhenPlayableRef,
  hlsLastActivityAtRef,
  hlsLastFragmentBufferedAtRef,
  hlsLastMediaRecoveryAtRef,
  hlsRef,
  hlsReleasedForPauseRef,
  hlsStartupAtRef,
  hlsSuspendedRef,
  lastStreamRetryAtRef,
  pendingResumeTargetRef,
  pendingTranscodeSeekDisplayRef,
  playbackLoadingRef,
  playerStatusRef,
  releaseCurrentHLSRef,
  retryCurrentStreamRef,
  selectedAudioTrackQueryIndexRef,
  selectedFileIndexRef,
  statusSnapshotRef,
  streamApplyOptionsRef,
  streamRetryRef,
  streamRetryTimerRef,
  streamUrlRef,
  tRef,
  totalDurationSecondsRef,
  transcodeStartOffsetRef,
  userPausedRef,
  videoRef,
  logWarn,
  logWarnRef,
  setAbsoluteCurrentSeconds,
  setIsVideoPaused,
  setNetworkCacheSeconds,
  setPlayableCacheAheadSeconds,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus,
  setPrebufferProgressSeconds,
  setStreamUrl,
  setTranscodeStartOffsetSeconds
}: UseTorrentPlayerStreamArgs) {
  const applyStreamUrl = useCallback((url: string, options?: { resumeAt?: number; autoplay?: boolean; recovery?: boolean; preload?: boolean }) => {
    if (!options?.recovery && streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current);
      streamRetryTimerRef.current = null;
      streamRetryRef.current = { key: "", attempts: 0 };
    }
    const isHLS = url.includes("/api/media/player/transmission/hls/playlist");
    if (isHLS) {
      hlsSuspendedRef.current = !options?.autoplay && !options?.preload;
      if (options?.autoplay) {
        hlsReleasedForPauseRef.current = false;
      }
    }
    streamUrlRef.current = url;
    streamApplyOptionsRef.current = options || {};
    if (options?.autoplay) {
      const video = videoRef.current;
      if (video) {
        video.autoplay = true;
      }
    }
    if (!options?.autoplay) {
      autoResumeWhenPlayableRef.current = false;
      pendingResumeTargetRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.autoplay = false;
        pauseNativeVideo(video);
      }
      setIsVideoPaused(true);
      setPlaybackLoading(false);
    }
    setStreamUrl(url);
  }, [
    autoResumeWhenPlayableRef,
    hlsReleasedForPauseRef,
    hlsSuspendedRef,
    pendingResumeTargetRef,
    setIsVideoPaused,
    setPlaybackLoading,
    setStreamUrl,
    streamApplyOptionsRef,
    streamRetryRef,
    streamRetryTimerRef,
    streamUrlRef,
    videoRef
  ]);

  useEffect(() => {
    streamUrlRef.current = streamUrl;
    setPrebufferProgressSeconds(0);
    setNetworkCacheSeconds(0);
  }, [setNetworkCacheSeconds, setPrebufferProgressSeconds, streamUrl, streamUrlRef]);

  useTorrentPlayerHlsSession({
    activePreferTranscode,
    streamUrl,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    activeStreamConfigKeyRef,
    hlsLastActivityAtRef,
    hlsLastFragmentBufferedAtRef,
    hlsLastMediaRecoveryAtRef,
    hlsRef,
    hlsReleasedForPauseRef,
    hlsStartupAtRef,
    hlsSuspendedRef,
    logWarnRef,
    retryCurrentStreamRef,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    tRef,
    transcodeStartOffsetRef,
    userPausedRef,
    videoRef,
    resolveHLSNetworkCacheAheadSeconds,
    settlePausedPlayback,
    setNetworkCacheSeconds,
    setPlayableCacheAheadSeconds,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus
  });

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
          message: player.toErrorMessage(error, "release failed")
        });
      }
    });
  }, [
    activePreferTranscodeRef,
    hlsRef,
    hlsReleasedForPauseRef,
    hlsSuspendedRef,
    infoHash,
    logWarn,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    setNetworkCacheSeconds,
    setPlayableCacheAheadSeconds,
    transcodeOutputResolution
  ]);

  useEffect(() => {
    releaseCurrentHLSRef.current = releaseCurrentHLS;
  }, [releaseCurrentHLS, releaseCurrentHLSRef]);

  useTorrentPlayerHlsHeartbeat({
    infoHash,
    selectedFileIndex,
    activePreferTranscode,
    transcodeOutputResolution,
    activePreferTranscodeRef,
    autoResumeWhenPlayableRef,
    hlsSuspendedRef,
    playbackLoadingRef,
    playerStatusRef,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    userPausedRef,
    videoRef,
    resolveAbsoluteCurrent,
    resolveHLSNetworkCacheAheadSeconds,
    logWarn
  });

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
    if (streamRetryTimerRef.current !== null && now - lastStreamRetryAtRef.current < player.STREAM_RETRY_DEDUPE_MS) {
      return true;
    }
    if (streamRetryRef.current.attempts >= player.STREAM_RETRY_MAX_ATTEMPTS) {
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
    const playableStart =
      preferTranscode && selected
        ? resolvePlayableTranscodeStartForFile(
          resumeAt,
          totalDurationSecondsRef.current,
          selected,
          statusSnapshotRef.current,
          `retry:${reason}`
        )
        : null;
    const effectiveResumeAt = playableStart?.seconds ?? resumeAt;
    const startBytes = playableStart?.startBytes ?? 0;
    const nextUrl =
      preferTranscode && selected
        ? buildPlayerTransmissionHLSPlaylistURL(
          infoHash,
          index,
          cacheTag,
          buildHLSPlaylistOptions({
            startSeconds: effectiveResumeAt,
            startBytes,
            prebufferSeconds: playableStart?.prebufferSeconds,
            durationSeconds: totalDurationSecondsRef.current
          })
        )
        : buildCurrentPlaybackStreamURL(cacheTag);
    if (!nextUrl) {
      return false;
    }
    activeStreamConfigKeyRef.current = player.buildPlaybackStreamConfigKeyWithStart({
      fileIndex: index,
      preferTranscode,
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution,
      prebufferSeconds: transcodePrebufferSeconds,
      startSeconds: preferTranscode ? effectiveResumeAt : 0
    });

    pendingResumeTargetRef.current = effectiveResumeAt;
    autoResumeWhenPlayableRef.current = true;
    pendingTranscodeSeekDisplayRef.current = preferTranscode ? { target: effectiveResumeAt, at: now } : null;
    if (preferTranscode) {
      setTranscodeStartOffsetSeconds(effectiveResumeAt);
      transcodeStartOffsetRef.current = effectiveResumeAt;
      setAbsoluteCurrentSeconds(effectiveResumeAt);
    }
    setPlayerError(null);
    setPlaybackLoading(true);
    setPlayerStatus("buffering");
    if (streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current);
    }
    const delayMs = Math.min(player.STREAM_RETRY_MAX_DELAY_MS, player.STREAM_RETRY_BASE_DELAY_MS * attempt);
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
      maxAttempts: player.STREAM_RETRY_MAX_ATTEMPTS,
      delayMs,
      resumeAt,
      effectiveResumeAt,
      mode,
      preferTranscode
    });
    return true;
  }, [
    activePreferTranscodeRef,
    activeStreamConfigKeyRef,
    applyStreamUrl,
    autoResumeWhenPlayableRef,
    buildCurrentPlaybackStreamURL,
    buildHLSPlaylistOptions,
    fileOptions,
    hlsReleasedForPauseRef,
    hlsSuspendedRef,
    infoHash,
    lastStreamRetryAtRef,
    logWarn,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    resolveAbsoluteCurrent,
    resolvePlayableTranscodeStartForFile,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    setAbsoluteCurrentSeconds,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    setTranscodeStartOffsetSeconds,
    settlePausedPlayback,
    statusSnapshotRef,
    streamRetryRef,
    streamRetryTimerRef,
    totalDurationSecondsRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    transcodeStartOffsetRef,
    userPausedRef
  ]);

  useEffect(() => {
    retryCurrentStreamRef.current = retryCurrentStream;
  }, [retryCurrentStream, retryCurrentStreamRef]);

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
  }, [releaseCurrentHLSRef]);

  return {
    applyStreamUrl,
    releaseCurrentHLS,
    retryCurrentStream
  };
}

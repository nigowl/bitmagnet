"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getAuthToken } from "@/lib/api";
import * as player from "./torrent-player/torrent-player-helpers";

type HlsLike = player.HlsLike;
type PlayerStatus = player.PlayerStatus;
type LogFn = (step: string, message: string, details?: unknown) => void;
type HlsFragmentPayload = {
  frag?: {
    duration?: number;
    stats?: {
      loaded?: number;
      total?: number;
    };
  };
};

type UseTorrentPlayerHlsSessionArgs = {
  activePreferTranscode: boolean;
  streamUrl: string;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  hlsLastActivityAtRef: MutableRefObject<number>;
  hlsLastFragmentBufferedAtRef: MutableRefObject<number>;
  hlsLastMediaRecoveryAtRef: MutableRefObject<number>;
  hlsRef: MutableRefObject<HlsLike | null>;
  hlsReleasedForPauseRef: MutableRefObject<boolean>;
  hlsStartupAtRef: MutableRefObject<number>;
  hlsSuspendedRef: MutableRefObject<boolean>;
  logWarnRef: MutableRefObject<LogFn>;
  pauseCurrentHLSLoadRef: MutableRefObject<(paused: boolean) => void>;
  retryCurrentStreamRef: MutableRefObject<(reason: string, manual?: boolean) => boolean>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  tRef: MutableRefObject<(key: string) => string>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  resolveHLSNetworkCacheAheadSeconds: () => number;
  settlePausedPlayback: (status?: PlayerStatus) => void;
  setNetworkCacheSeconds: Dispatch<SetStateAction<number>>;
  setNetworkCacheLoading: Dispatch<SetStateAction<boolean>>;
  setPlayableCacheAheadSeconds: Dispatch<SetStateAction<number>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
};

export function useTorrentPlayerHlsSession({
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
  pauseCurrentHLSLoadRef,
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
  setNetworkCacheLoading,
  setPlayableCacheAheadSeconds,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus
}: UseTorrentPlayerHlsSessionArgs) {
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
    let cacheMonitorTimer: number | null = null;
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
        const browserBufferTargetSeconds = Math.max(10, transcodePrebufferSeconds);
        const hls = new HlsCtor({
          autoStartLoad: false,
          enableWorker: true,
          lowLatencyMode: false,
          startPosition: 0,
          maxBufferLength: browserBufferTargetSeconds,
          maxMaxBufferLength: browserBufferTargetSeconds,
          maxBufferSize: player.HLS_MAX_BUFFER_SIZE_BYTES,
          backBufferLength: 0,
          appendErrorMaxRetry: 8,
          xhrSetup: (xhr: XMLHttpRequest) => {
            const token = getAuthToken();
            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }
            xhr.withCredentials = true;
          }
        }) as HlsLike;
        hlsRef.current = hls;
        let hlsLoadActive = false;
        hlsStartupAtRef.current = Date.now();
        hlsLastActivityAtRef.current = hlsStartupAtRef.current;
        hlsLastFragmentBufferedAtRef.current = 0;
        hlsLastMediaRecoveryAtRef.current = 0;
        activeStreamConfigKeyRef.current = player.buildPlaybackStreamConfigKeyWithStart({
          fileIndex: selectedFileIndexRef.current,
          preferTranscode: true,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds,
          startSeconds: transcodeStartOffsetRef.current
        });

        let recentBufferedBytesPerSecond = 0;
        const rememberFragmentSize = (data?: unknown) => {
          const payload = data as HlsFragmentPayload | undefined;
          const duration = Number(payload?.frag?.duration || 0);
          const bytes = Number(payload?.frag?.stats?.total || payload?.frag?.stats?.loaded || 0);
          if (duration <= 0 || bytes <= 0) return;
          const bytesPerSecond = bytes / duration;
          recentBufferedBytesPerSecond = recentBufferedBytesPerSecond
            ? recentBufferedBytesPerSecond * 0.7 + bytesPerSecond * 0.3
            : bytesPerSecond;
        };
        const estimateBufferedBytes = (ahead: number) => Math.max(0, ahead * recentBufferedBytesPerSecond);
        const ensureHLSBufferTarget = () => {
          if (hls.config) {
            hls.config.maxBufferLength = browserBufferTargetSeconds;
            hls.config.maxMaxBufferLength = browserBufferTargetSeconds;
            hls.config.maxBufferSize = player.HLS_MAX_BUFFER_SIZE_BYTES;
          }
        };

        const startHLSLoad = (startPosition?: number) => {
          if (hlsLoadActive || cancelled) return;
          hls.startLoad?.(startPosition);
          hlsLoadActive = true;
          setNetworkCacheLoading(true);
        };
        const stopHLSLoad = () => {
          if (!hlsLoadActive) return;
          hls.stopLoad?.();
          hlsLoadActive = false;
          setNetworkCacheLoading(false);
        };
        const refreshHLSCacheState = (markActivity = true, adjustLoading = false) => {
          if (markActivity) {
            hlsLastActivityAtRef.current = Date.now();
          }
          ensureHLSBufferTarget();
          const ahead = resolveHLSNetworkCacheAheadSeconds();
          const displayAhead = player.hlsNetworkCacheDisplaySeconds(ahead, transcodePrebufferSeconds);
          setNetworkCacheSeconds((current) => (Math.abs(current - displayAhead) < 0.25 ? current : displayAhead));
          setPlayableCacheAheadSeconds((current) => (Math.abs(current - ahead) < 0.25 ? current : ahead));
          if (!adjustLoading || hlsSuspendedRef.current || hlsReleasedForPauseRef.current) return;

          const bufferedBytes = estimateBufferedBytes(ahead);
          const shouldStopForSize = bufferedBytes >= player.HLS_MAX_BUFFER_SIZE_BYTES * player.HLS_BROWSER_BUFFER_BYTES_STOP_RATIO;
          const canResumeForSize = !recentBufferedBytesPerSecond || bufferedBytes <= player.HLS_MAX_BUFFER_SIZE_BYTES * player.HLS_BROWSER_BUFFER_BYTES_RESUME_RATIO;
          if (ahead < browserBufferTargetSeconds * player.HLS_BROWSER_BUFFER_CATCHUP_RATIO && canResumeForSize) {
            startHLSLoad();
          } else if ((ahead >= browserBufferTargetSeconds || shouldStopForSize) && hlsLoadActive) {
            stopHLSLoad();
          }
        };
        pauseCurrentHLSLoadRef.current = (paused: boolean) => {
          void paused;
          refreshHLSCacheState(true, true);
        };
        const startInitialHLSLoad = () => {
          if (cancelled) return;
          if (userPausedRef.current || hlsSuspendedRef.current) return;
          hlsLastActivityAtRef.current = Date.now();
          startHLSLoad(0);
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
        hls.on(HlsCtor.Events.MANIFEST_PARSED, startInitialHLSLoad);
        hls.on(HlsCtor.Events.LEVEL_LOADED, () => {
          if (cancelled) return;
          refreshHLSCacheState(true, true);
        });
        hls.on(HlsCtor.Events.FRAG_BUFFERED, (_event, data) => {
          rememberFragmentSize(data);
          hlsLastFragmentBufferedAtRef.current = Date.now();
          refreshHLSCacheState(true, true);
        });
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (cancelled) return;
          hlsLastActivityAtRef.current = Date.now();
          const payload = data as { fatal?: boolean; type?: string; details?: string };
          logWarnRef.current("hls", "hls playback error", payload);
          if (userPausedRef.current || hlsSuspendedRef.current || hlsReleasedForPauseRef.current) {
            settlePausedPlayback();
            return;
          }
          const details = String(payload?.details || "");
          const type = String(payload?.type || "");
          const isBufferFullError = details === "bufferFullError";
          const isAppendError = details === "bufferAppendError" || details === "bufferAppendingError" || isBufferFullError;
          const isMediaError = type === "mediaError" || isAppendError;
          if (!payload?.fatal) {
            if (isBufferFullError) {
              stopHLSLoad();
              refreshHLSCacheState(true, false);
              setPlaybackLoading(false);
              setPlayerStatus(video.paused ? "ready" : "playing");
              logWarnRef.current("hls", "pause hls load after source buffer full", {
                details,
                type,
                bufferedAhead: resolveHLSNetworkCacheAheadSeconds()
              });
              return;
            }
            if (isMediaError && Date.now() - hlsLastMediaRecoveryAtRef.current > player.HLS_MEDIA_RECOVERY_COOLDOWN_MS) {
              hlsLastMediaRecoveryAtRef.current = Date.now();
              hls.recoverMediaError?.();
              setPlaybackLoading(true);
              setPlayerStatus("buffering");
              logWarnRef.current("hls", "recover hls media buffer error", { details, type });
            }
            return;
          }
          if (isMediaError && Date.now() - hlsLastMediaRecoveryAtRef.current > player.HLS_MEDIA_RECOVERY_COOLDOWN_MS) {
            hlsLastMediaRecoveryAtRef.current = Date.now();
            hls.recoverMediaError?.();
            setPlaybackLoading(true);
            setPlayerStatus("buffering");
            logWarnRef.current("hls", "recover fatal hls media error before retry", { details, type });
            return;
          }
          if (retryCurrentStreamRef.current("hls_error")) return;
          setPlaybackLoading(false);
          setPlayerStatus("error");
          setPlayerError(tRef.current("media.player.playbackError"));
        });
        hls.attachMedia(video);
        refreshHLSCacheState(false, true);
        cacheMonitorTimer = window.setInterval(() => {
          if (cancelled) return;
          refreshHLSCacheState(false, true);
        }, player.HLS_NETWORK_CACHE_MONITOR_MS);
      })
      .catch((error) => {
        if (cancelled) return;
        logWarnRef.current("hls", "failed to initialize hls.js", { message: player.toErrorMessage(error, "hls init failed") });
        applyNativeHLS();
      });

    return () => {
      cancelled = true;
      if (cacheMonitorTimer !== null) {
        window.clearInterval(cacheMonitorTimer);
      }
      setNetworkCacheLoading(false);
      pauseCurrentHLSLoadRef.current = () => {};
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [
    activePreferTranscode,
    activeStreamConfigKeyRef,
    hlsLastActivityAtRef,
    hlsLastFragmentBufferedAtRef,
    hlsLastMediaRecoveryAtRef,
    hlsRef,
    hlsReleasedForPauseRef,
    hlsStartupAtRef,
    hlsSuspendedRef,
    logWarnRef,
    pauseCurrentHLSLoadRef,
    resolveHLSNetworkCacheAheadSeconds,
    retryCurrentStreamRef,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    setNetworkCacheSeconds,
    setNetworkCacheLoading,
    setPlayableCacheAheadSeconds,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    settlePausedPlayback,
    streamUrl,
    tRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    transcodeStartOffsetRef,
    userPausedRef,
    videoRef
  ]);
}

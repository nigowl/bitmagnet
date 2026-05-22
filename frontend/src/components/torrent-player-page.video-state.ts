"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { pauseNativeVideo } from "@/lib/player/native-media";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerVideoStateArgs = {
  streamUrl: string;
  transcodePrebufferSeconds: number;
  attemptResumePlayback: (reason: string, targetSeconds?: number) => void;
  emitTimelineRefreshEvents: () => void;
  refreshAudioTracks: () => void;
  resolveBufferedAheadSeconds: () => number;
  resolveCachedAheadSeconds: () => number;
  resolveHLSNetworkCacheAheadSeconds: () => number;
  settlePausedPlayback: (status?: PlayerStatus) => void;
  syncSelectedAudioTrack: () => void;
  activePreferTranscodeRef: MutableRefObject<boolean>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  isSeekingDragRef: MutableRefObject<boolean>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  seekingSwitchingRef: MutableRefObject<boolean>;
  streamApplyOptionsRef: MutableRefObject<{ resumeAt?: number; autoplay?: boolean; recovery?: boolean; preload?: boolean }>;
  streamRetryRef: MutableRefObject<{ key: string; attempts: number }>;
  transcodeSeekInFlightRef: MutableRefObject<boolean>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logInfo: LogFn;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setIsVideoPaused: Dispatch<SetStateAction<boolean>>;
  setNetworkCacheSeconds: Dispatch<SetStateAction<number>>;
  setPlayableCacheAheadSeconds: Dispatch<SetStateAction<number>>;
  setPrebufferProgressSeconds: Dispatch<SetStateAction<number>>;
  setVideoAspectRatioCss: Dispatch<SetStateAction<string>>;
  setVideoAspectRatioValue: Dispatch<SetStateAction<number>>;
  setVideoDuration: Dispatch<SetStateAction<number>>;
  setVideoPlaybackRate: Dispatch<SetStateAction<number>>;
  setVideoSourceHeight: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerVideoState({
  streamUrl,
  transcodePrebufferSeconds,
  attemptResumePlayback,
  emitTimelineRefreshEvents,
  refreshAudioTracks,
  resolveBufferedAheadSeconds,
  resolveCachedAheadSeconds,
  resolveHLSNetworkCacheAheadSeconds,
  settlePausedPlayback,
  syncSelectedAudioTrack,
  activePreferTranscodeRef,
  autoResumeWhenPlayableRef,
  isSeekingDragRef,
  pendingTranscodeSeekDisplayRef,
  seekingSwitchingRef,
  streamApplyOptionsRef,
  streamRetryRef,
  transcodeSeekInFlightRef,
  transcodeStartOffsetRef,
  userPausedRef,
  videoRef,
  logInfo,
  setAbsoluteCurrentSeconds,
  setIsVideoPaused,
  setNetworkCacheSeconds,
  setPlayableCacheAheadSeconds,
  setPrebufferProgressSeconds,
  setVideoAspectRatioCss,
  setVideoAspectRatioValue,
  setVideoDuration,
  setVideoPlaybackRate,
  setVideoSourceHeight
}: UseTorrentPlayerVideoStateArgs) {
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
          pauseNativeVideo(video);
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
  }, [
    activePreferTranscodeRef,
    attemptResumePlayback,
    emitTimelineRefreshEvents,
    logInfo,
    pendingTranscodeSeekDisplayRef,
    refreshAudioTracks,
    seekingSwitchingRef,
    settlePausedPlayback,
    streamUrl,
    streamApplyOptionsRef,
    streamRetryRef,
    syncSelectedAudioTrack,
    transcodePrebufferSeconds,
    transcodeSeekInFlightRef,
    userPausedRef,
    videoRef,
    setPrebufferProgressSeconds
  ]);

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
        const nextNetworkCache = player.hlsNetworkCacheDisplaySeconds(resolveHLSNetworkCacheAheadSeconds(), transcodePrebufferSeconds);
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
  }, [
    activePreferTranscodeRef,
    resolveBufferedAheadSeconds,
    resolveCachedAheadSeconds,
    resolveHLSNetworkCacheAheadSeconds,
    setNetworkCacheSeconds,
    setPlayableCacheAheadSeconds,
    setPrebufferProgressSeconds,
    streamUrl,
    transcodePrebufferSeconds,
    videoRef
  ]);

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
      const paused = video.paused || video.ended;
      if (paused) {
        if (!autoResumeWhenPlayableRef.current && !seekingSwitchingRef.current && !transcodeSeekInFlightRef.current) {
          userPausedRef.current = true;
        }
      } else {
        userPausedRef.current = false;
      }
      setIsVideoPaused(paused);
      setVideoPlaybackRate(Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1);
    };

    sync();
    video.addEventListener("play", sync);
    video.addEventListener("playing", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("ended", sync);
    video.addEventListener("ratechange", sync);
    video.addEventListener("timeupdate", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("seeking", sync);
    video.addEventListener("seeked", sync);

    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("playing", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("ended", sync);
      video.removeEventListener("ratechange", sync);
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("seeking", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [
    activePreferTranscodeRef,
    isSeekingDragRef,
    autoResumeWhenPlayableRef,
    pendingTranscodeSeekDisplayRef,
    setAbsoluteCurrentSeconds,
    setIsVideoPaused,
    setVideoAspectRatioCss,
    setVideoAspectRatioValue,
    setVideoDuration,
    setVideoPlaybackRate,
    setVideoSourceHeight,
    seekingSwitchingRef,
    transcodeSeekInFlightRef,
    transcodeStartOffsetRef,
    userPausedRef,
    videoRef
  ]);

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
  }, [
    activePreferTranscodeRef,
    isSeekingDragRef,
    pendingTranscodeSeekDisplayRef,
    setAbsoluteCurrentSeconds,
    transcodeSeekInFlightRef,
    transcodeStartOffsetRef,
    videoRef
  ]);
}

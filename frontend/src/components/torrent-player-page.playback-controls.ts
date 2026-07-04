"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction, type MouseEvent as ReactMouseEvent } from "react";
import {
  pauseNativeVideo,
  setNativePlaybackRate,
  toggleNativeFullscreen,
  toggleNativePictureInPicture
} from "@/lib/player/native-media";
import { buildPlayerTransmissionHLSPlaylistURL, type PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type PlaybackFileOption = player.PlaybackFileOption;
type LogFn = (step: string, message: string, details?: unknown) => void;
type ApplyStreamUrl = (
  url: string,
  options?: { resumeAt?: number; autoplay?: boolean; recovery?: boolean; preload?: boolean }
) => void;
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

type UseTorrentPlayerPlaybackControlsArgs = {
  infoHash: string;
  streamUrl: string;
  canInitializePlayer: boolean;
  isFullscreenActive: boolean;
  activePreferTranscode: boolean;
  selectedFileOption: PlaybackFileOption | null;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  videoPlaybackRate: number;
  applyStreamUrl: ApplyStreamUrl;
  attemptResumePlayback: (reason: string, targetSeconds?: number) => void;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  handleSeekCommit: (targetSecondsInput: number, source?: "panel" | "native") => Promise<void>;
  resolveAbsoluteCurrent: () => number;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  syncSelectedAudioTrack: () => void;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  hlsReleasedForPauseRef: MutableRefObject<boolean>;
  hlsSuspendedRef: MutableRefObject<boolean>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  playerStageRef: MutableRefObject<HTMLDivElement | null>;
  releaseCurrentHLSRef: MutableRefObject<(reason: string, keepalive?: boolean) => void>;
  revealControlsTimerRef: MutableRefObject<number | null>;
  revealInlineControlsRef: MutableRefObject<(delayMs?: number) => void>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  stageClickTimerRef: MutableRefObject<number | null>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  totalDurationSecondsRef: MutableRefObject<number>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logInfo: LogFn;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setIsVideoPaused: Dispatch<SetStateAction<boolean>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
  setVideoPlaybackRate: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerPlaybackControls({
  infoHash,
  streamUrl,
  canInitializePlayer,
  isFullscreenActive,
  activePreferTranscode,
  selectedFileOption,
  transcodeOutputResolution,
  transcodePrebufferSeconds,
  videoPlaybackRate,
  applyStreamUrl,
  attemptResumePlayback,
  buildHLSPlaylistOptions,
  handleSeekCommit,
  resolveAbsoluteCurrent,
  resolvePlayableTranscodeStartForFile,
  syncSelectedAudioTrack,
  activeStreamConfigKeyRef,
  autoResumeWhenPlayableRef,
  hlsReleasedForPauseRef,
  hlsSuspendedRef,
  pendingResumeTargetRef,
  pendingTranscodeSeekDisplayRef,
  playerStageRef,
  releaseCurrentHLSRef,
  revealControlsTimerRef,
  revealInlineControlsRef,
  selectedAudioTrackQueryIndexRef,
  stageClickTimerRef,
  statusSnapshotRef,
  totalDurationSecondsRef,
  transcodeStartOffsetRef,
  userPausedRef,
  videoRef,
  logInfo,
  setAbsoluteCurrentSeconds,
  setIsVideoPaused,
  setPlaybackLoading,
  setPlayerStatus,
  setTranscodeStartOffsetSeconds,
  setVideoPlaybackRate
}: UseTorrentPlayerPlaybackControlsArgs) {
  const handleTogglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const isPaused = video.paused;
    if (isPaused) {
      userPausedRef.current = false;
      if (activePreferTranscode && (hlsSuspendedRef.current || hlsReleasedForPauseRef.current) && infoHash && selectedFileOption) {
        const resumeAt = Math.max(0, resolveAbsoluteCurrent());
        const playableStart = resolvePlayableTranscodeStartForFile(
          resumeAt,
          totalDurationSecondsRef.current,
          selectedFileOption,
          statusSnapshotRef.current,
          "resume_playback"
        );
        const effectiveResumeAt = playableStart.seconds;
        const startBytes = playableStart.startBytes;
        const nextUrl = buildPlayerTransmissionHLSPlaylistURL(
          infoHash,
          selectedFileOption.index,
          `resume-${selectedFileOption.index}-${Math.floor(effectiveResumeAt * 10)}-${Date.now()}`,
          buildHLSPlaylistOptions({
            startSeconds: effectiveResumeAt,
            startBytes,
            prebufferSeconds: playableStart.prebufferSeconds,
            durationSeconds: totalDurationSecondsRef.current
          })
        );
        setTranscodeStartOffsetSeconds(effectiveResumeAt);
        transcodeStartOffsetRef.current = effectiveResumeAt;
        pendingTranscodeSeekDisplayRef.current = effectiveResumeAt > 0 ? { target: effectiveResumeAt, at: Date.now() } : null;
        pendingResumeTargetRef.current = effectiveResumeAt;
        setAbsoluteCurrentSeconds(effectiveResumeAt);
        autoResumeWhenPlayableRef.current = true;
        hlsSuspendedRef.current = false;
        hlsReleasedForPauseRef.current = false;
        activeStreamConfigKeyRef.current = player.buildPlaybackStreamConfigKeyWithStart({
          fileIndex: selectedFileOption.index,
          preferTranscode: true,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds,
          startSeconds: effectiveResumeAt
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
    setIsVideoPaused(true);
    pauseNativeVideo(video);
    if (activePreferTranscode && !hlsReleasedForPauseRef.current) {
      releaseCurrentHLSRef.current("manual_pause");
    }
  }, [
    activePreferTranscode,
    activeStreamConfigKeyRef,
    applyStreamUrl,
    attemptResumePlayback,
    autoResumeWhenPlayableRef,
    buildHLSPlaylistOptions,
    hlsReleasedForPauseRef,
    hlsSuspendedRef,
    infoHash,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    resolveAbsoluteCurrent,
    resolvePlayableTranscodeStartForFile,
    releaseCurrentHLSRef,
    selectedFileOption,
    selectedAudioTrackQueryIndexRef,
    setAbsoluteCurrentSeconds,
    setIsVideoPaused,
    setPlaybackLoading,
    setPlayerStatus,
    setTranscodeStartOffsetSeconds,
    statusSnapshotRef,
    totalDurationSecondsRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    transcodeStartOffsetRef,
    userPausedRef,
    videoRef
  ]);

  const handleUserTogglePlayback = useCallback((source: "button" | "stage" | "keyboard") => {
    handleTogglePlayback();
    window.requestAnimationFrame(() => {
      syncSelectedAudioTrack();
      logInfo("playback", "toggle playback from unified control", { source });
    });
  }, [handleTogglePlayback, logInfo, syncSelectedAudioTrack]);

  const handleStageClickTogglePlayback = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
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
      handleUserTogglePlayback("stage");
    }, player.PLAYER_STAGE_CLICK_DELAY_MS);
  }, [handleUserTogglePlayback, stageClickTimerRef]);

  useEffect(() => {
    if (!canInitializePlayer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      const editable = Boolean(target?.isContentEditable) || tag === "input" || tag === "textarea" || tag === "select";
      if (editable) return;
      const revealControlsForKeyboardSeek = () => {
        revealInlineControlsRef.current(isFullscreenActive ? player.INLINE_CONTROLS_FULLSCREEN_HIDE_MS : player.INLINE_CONTROLS_KEYBOARD_HIDE_MS);
        if (revealControlsTimerRef.current !== null) {
          window.clearTimeout(revealControlsTimerRef.current);
        }
        revealControlsTimerRef.current = window.setTimeout(() => {
          revealControlsTimerRef.current = null;
        }, isFullscreenActive ? player.INLINE_CONTROLS_FULLSCREEN_HIDE_MS : player.INLINE_CONTROLS_KEYBOARD_HIDE_MS);
      };
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handleUserTogglePlayback("keyboard");
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
  }, [
    canInitializePlayer,
    handleSeekCommit,
    handleUserTogglePlayback,
    isFullscreenActive,
    resolveAbsoluteCurrent,
    revealControlsTimerRef,
    revealInlineControlsRef
  ]);

  const handleSetPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = setNativePlaybackRate(video, rate);
    setVideoPlaybackRate(next);
  }, [setVideoPlaybackRate, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const applyPlaybackRate = () => {
      const nextRate = player.normalizePlaybackRatePreference(videoPlaybackRate);
      if (Math.abs(video.playbackRate - nextRate) >= 0.01) {
        setNativePlaybackRate(video, nextRate);
      }
    };
    applyPlaybackRate();
    video.addEventListener("loadedmetadata", applyPlaybackRate);
    video.addEventListener("canplay", applyPlaybackRate);
    video.addEventListener("play", applyPlaybackRate);
    return () => {
      video.removeEventListener("loadedmetadata", applyPlaybackRate);
      video.removeEventListener("canplay", applyPlaybackRate);
      video.removeEventListener("play", applyPlaybackRate);
    };
  }, [streamUrl, videoPlaybackRate, videoRef]);

  const handleTogglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await toggleNativePictureInPicture(video, document);
    } catch {
      // no-op
    }
  }, [videoRef]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      await toggleNativeFullscreen(playerStageRef.current, videoRef.current, document);
    } catch {
      // no-op
    }
  }, [playerStageRef, videoRef]);

  const handleStageDoubleClickToggleFullscreen = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".torrent-inline-controls") || target.closest(".torrent-inline-settings-menu")) {
      return;
    }
    if (stageClickTimerRef.current !== null) {
      window.clearTimeout(stageClickTimerRef.current);
      stageClickTimerRef.current = null;
    }
    revealInlineControlsRef.current(player.INLINE_CONTROLS_FULLSCREEN_HIDE_MS);
    void handleToggleFullscreen();
  }, [handleToggleFullscreen, revealInlineControlsRef, stageClickTimerRef]);

  const handleTogglePlaybackButton = useCallback(() => {
    handleUserTogglePlayback("button");
  }, [handleUserTogglePlayback]);

  return {
    handleSetPlaybackRate,
    handleStageClickTogglePlayback,
    handleStageDoubleClickToggleFullscreen,
    handleToggleFullscreen,
    handleTogglePip,
    handleTogglePlaybackButton,
    handleUserTogglePlayback
  };
}

"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import * as player from "./torrent-player/torrent-player-helpers";
import { useTorrentPlayerAudioTracks } from "./torrent-player-page.audio-tracks";
import { useTorrentPlayerBootstrap } from "./torrent-player-page.bootstrap";
import { useTorrentPlayerInlineControls } from "./torrent-player-page.controls";
import { useTorrentPlayerDiagnostics } from "./torrent-player-page.diagnostics";
import { useTorrentPlayerDetail } from "./torrent-player-page.detail";
import { useTorrentPlayerDomEffects } from "./torrent-player-page.dom-effects";
import { useTorrentPlayerFiles } from "./torrent-player-page.files";
import { useTorrentPlayerHousekeeping } from "./torrent-player-page.housekeeping";
import { useTorrentPlayerLifecycle } from "./torrent-player-page.lifecycle";
import { useTorrentPlayerOptions } from "./torrent-player-page.options";
import { useTorrentPlayerPanelHandlers } from "./torrent-player-page.panel-handlers";
import { useTorrentPlayerPlaybackEvents } from "./torrent-player-page.playback-events";
import { useTorrentPlayerPlaybackControls } from "./torrent-player-page.playback-controls";
import { useTorrentPlayerPlaybackRuntime } from "./torrent-player-page.playback-runtime";
import { useTorrentPlayerGlobalPreferences, useTorrentPlayerTrackPreferences } from "./torrent-player-page.preferences";
import { useTorrentPlayerRefs } from "./torrent-player-page.refs";
import { useTorrentPlayerResumePrompt } from "./torrent-player-page.resume";
import { TorrentPlayerPageRender } from "./torrent-player-page.render";
import { useTorrentPlayerSeek } from "./torrent-player-page.seek";
import { useTorrentPlayerSeekUi } from "./torrent-player-page.seek-ui";
import { useTorrentPlayerState } from "./torrent-player-page.state";
import { useTorrentPlayerStreamConfig } from "./torrent-player-page.stream-config";
import { useTorrentPlayerStream } from "./torrent-player-page.stream";
import { useTorrentPlayerSubtitles } from "./torrent-player-page.subtitles";
import { useTorrentPlayerVideoState } from "./torrent-player-page.video-state";
import { useTorrentPlayerViewModel } from "./torrent-player-page.view-model";

const formatBytes = player.formatBytes;
const formatSpeed = player.formatSpeed;
const formatClock = player.formatClock;
const formatSubtitleOffsetLabel = player.formatSubtitleOffsetLabel;

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

  const {
    videoRef,
    playerStageRef,
    inlineSettingsRef,
    transcodeSeekInFlightRef,
    pendingTranscodeSeekDisplayRef,
    isSeekingDragRef,
    initializedInfoHashRef,
    subtitleLoadTokenRef,
    audioTrackLoadTokenRef,
    hlsRef,
    hlsStartupAtRef,
    hlsLastActivityAtRef,
    hlsLastFragmentBufferedAtRef,
    hlsLastMediaRecoveryAtRef,
    hlsSuspendedRef,
    hlsReleasedForPauseRef,
    userPausedRef,
    activeStreamConfigKeyRef,
    selectedFileIndexRef,
    fileSwitchingRef,
    streamUrlRef,
    streamRetryRef,
    streamRetryTimerRef,
    lastStreamRetryAtRef,
    retryCurrentStreamRef,
    releaseCurrentHLSRef,
    stageClickTimerRef,
    streamApplyOptionsRef,
    activePreferTranscodeRef,
    statusSnapshotRef,
    totalDurationSecondsRef,
    transcodeStartOffsetRef,
    absoluteCurrentSecondsRef,
    lastPlaybackProgressRef,
    stallStartedAtRef,
    lastAutoRecoveryAtRef,
    seekingSwitchingRef,
    subtitleUploadInputRef,
    selectedAudioTrackQueryIndexRef,
    tRef,
    logWarnRef,
    bootstrapRunTokenRef,
    pendingResumeTargetRef,
    autoResumeWhenPlayableRef,
    globalPreferencesHydratedRef,
    trackPreferencesHydratedKeyRef,
    revealControlsTimerRef,
    revealInlineControlsRef,
    playbackLoadingRef,
    playerStatusRef
  } = useTorrentPlayerRefs(t);

  const {
    bootstrapLoading,
    setBootstrapLoading,
    bootstrapped,
    setBootstrapped,
    fileSwitching,
    setFileSwitching,
    detail,
    setDetail,
    playerStatus,
    setPlayerStatus,
    playerError,
    setPlayerError,
    streamUrl,
    setStreamUrl,
    videoDuration,
    setVideoDuration,
    absoluteCurrentSeconds,
    setAbsoluteCurrentSeconds,
    videoAspectRatioCss,
    setVideoAspectRatioCss,
    videoAspectRatioValue,
    setVideoAspectRatioValue,
    videoSourceHeight,
    setVideoSourceHeight,
    isVideoPaused,
    setIsVideoPaused,
    videoPlaybackRate,
    setVideoPlaybackRate,
    settingsOpen,
    setSettingsOpen,
    isPipActive,
    setIsPipActive,
    isFullscreenActive,
    setIsFullscreenActive,
    isSeekingDrag,
    setIsSeekingDrag,
    seekDraftSeconds,
    setSeekDraftSeconds,
    seekHoverSeconds,
    setSeekHoverSeconds,
    seekHoverRatio,
    setSeekHoverRatio,
    seekPreviewFailedKey,
    setSeekPreviewFailedKey,
    seekPreviewLoadedKey,
    setSeekPreviewLoadedKey,
    videoFitMode,
    setVideoFitMode,
    transcodeStartOffsetSeconds,
    setTranscodeStartOffsetSeconds,
    transcodeOutputResolution,
    setTranscodeOutputResolution,
    subtitleStylePreset,
    setSubtitleStylePreset,
    subtitleManagerOpened,
    setSubtitleManagerOpened,
    subtitleManagerTab,
    setSubtitleManagerTab,
    playbackLoading,
    setPlaybackLoading,
    transcodePrebufferSeconds,
    setTranscodePrebufferSeconds,
    prebufferProgressSeconds,
    setPrebufferProgressSeconds,
    networkCacheSeconds,
    setNetworkCacheSeconds,
    playableCacheAheadSeconds,
    setPlayableCacheAheadSeconds
  } = useTorrentPlayerState();

  const {
    diagnostics,
    diagnosticsOpened,
    setDiagnostics,
    setDiagnosticsOpened,
    logInfo,
    logWarn,
    logError,
    handleCopyLogs
  } = useTorrentPlayerDiagnostics(t);
  const {
    subtitleItems,
    subtitleSiteLinks,
    subtitleCueMap,
    selectedSubtitleId,
    setSelectedSubtitleId,
    subtitleLoading,
    resetSubtitles,
    loadSubtitles,
    handleSubtitleUploadPick,
    handleDeleteSubtitle,
    handleAdjustSubtitleOffset
  } = useTorrentPlayerSubtitles({
    t,
    locale,
    infoHash,
    detail,
    subtitleStyleVerticalPercent: subtitleStylePreset.verticalPercent,
    subtitleLoadTokenRef,
    logInfo,
    logWarn
  });
  const {
    audioTrackOptions,
    selectedAudioTrackId,
    setSelectedAudioTrackId,
    audioTrackSelectionAvailable,
    serverAudioTracks,
    selectedAudioTrackQueryIndex,
    resetAudioTracks,
    loadServerAudioTracks,
    refreshAudioTracks,
    syncSelectedAudioTrack
  } = useTorrentPlayerAudioTracks({
    t,
    infoHash,
    streamUrl,
    videoRef,
    audioTrackLoadTokenRef,
    selectedFileIndexRef,
    selectedAudioTrackQueryIndexRef
  });
  const {
    statusSnapshot,
    setStatusSnapshot,
    fileOptions,
    applyFileOptions,
    selectedFileIndex,
    setSelectedFileIndex,
    pendingRequestedFileIndexRef
  } = useTorrentPlayerFiles({
    infoHash,
    requestedFileIndex,
    bootstrapped,
    fileSwitchingRef,
    selectedFileIndexRef,
    statusSnapshotRef,
    logWarn
  });

  useTorrentPlayerHousekeeping({
    infoHash,
    selectedFileIndex,
    absoluteCurrentSeconds,
    isSeekingDrag,
    isSeekingDragRef,
    absoluteCurrentSecondsRef,
    streamRetryTimerRef,
    revealControlsTimerRef,
    hlsRef,
    initializedInfoHashRef,
    subtitleLoadTokenRef,
    bootstrapRunTokenRef,
    streamRetryRef,
    lastStreamRetryAtRef,
    lastAutoRecoveryAtRef,
    stallStartedAtRef,
    lastPlaybackProgressRef,
    resetSubtitles,
    resetAudioTracks,
    setVideoSourceHeight
  });

  useTorrentPlayerGlobalPreferences({
    userId: user?.id,
    videoPlaybackRate,
    videoFitMode,
    transcodePrebufferSeconds,
    transcodeOutputResolution,
    subtitleStylePreset,
    hydratedRef: globalPreferencesHydratedRef,
    setVideoPlaybackRate,
    setVideoFitMode,
    setTranscodePrebufferSeconds,
    setTranscodeOutputResolution,
    setSubtitleStylePreset
  });

  useTorrentPlayerTrackPreferences({
    infoHash,
    selectedFileIndex,
    userId: user?.id,
    selectedSubtitleId,
    selectedAudioTrackId,
    hydratedKeyRef: trackPreferencesHydratedKeyRef,
    setSelectedSubtitleId,
    setSelectedAudioTrackId
  });

  const {
    playbackRateOptions,
    selectedSubtitleItem,
    subtitleScaleOptions,
    subtitleTrackOptions,
    transcodeResolutionOptions
  } = useTorrentPlayerOptions({
    t,
    fileOptions,
    selectedFileIndex,
    videoSourceHeight,
    subtitleItems,
    selectedSubtitleId,
    transcodeOutputResolution,
    subtitleStylePreset,
    setTranscodeOutputResolution
  });

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
  }, [autoResumeWhenPlayableRef, playbackLoadingRef, playerStatusRef, userPausedRef, videoRef]);

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
    [autoResumeWhenPlayableRef, setIsVideoPaused, setPlaybackLoading, setPlayerStatus, setTranscodeOutputResolution, shouldAutoplayStreamChange, transcodeOutputResolution, userPausedRef]
  );

  const {
    activePreferTranscode,
    buildCurrentPlaybackStreamURL,
    buildHLSPlaylistOptions,
    canInitializePlayer,
    resolvePlayableTranscodeStartForFile,
    resolvePreferTranscode,
    selectedFileOption,
    totalDurationSeconds
  } = useTorrentPlayerStreamConfig({
    infoHash,
    detail,
    statusSnapshot,
    fileOptions,
    selectedFileIndex,
    selectedAudioTrackId,
    selectedAudioTrackQueryIndex,
    serverAudioTracks,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    videoDuration,
    bootstrapLoading,
    bootstrapped,
    streamUrl,
    selectedFileIndexRef,
    statusSnapshotRef,
    totalDurationSecondsRef,
    logInfo
  });

  useEffect(() => {
    playerStatusRef.current = playerStatus;
  }, [playerStatus, playerStatusRef]);

  useEffect(() => {
    playbackLoadingRef.current = playbackLoading;
  }, [playbackLoading, playbackLoadingRef]);

  useEffect(() => {
    tRef.current = t;
  }, [t, tRef]);

  useEffect(() => {
    logWarnRef.current = logWarn;
  }, [logWarn, logWarnRef]);

  const {
    attemptResumePlayback,
    resolveAbsoluteCurrent,
    resolveBufferedAheadAtSeconds,
    resolveBufferedAheadSeconds,
    resolveCachedAheadSeconds,
    resolveHLSNetworkCacheAheadSeconds,
    settlePausedPlayback
  } = useTorrentPlayerPlaybackRuntime({
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
  });

  const { applyStreamUrl } = useTorrentPlayerStream({
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
  });

  const emitTimelineRefreshEvents = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
  }, [videoRef]);

  const loadTorrentDetail = useTorrentPlayerDetail({
    t,
    infoHash,
    setDetail,
    setPlayerError,
    logInfo,
    logWarn
  });

  const { bootstrapPlayer, handleSelectFile } = useTorrentPlayerBootstrap({
    t,
    infoHash,
    userId: user?.id,
    detail,
    applyFileOptions,
    applyStreamUrl,
    buildHLSPlaylistOptions,
    resolvePlayableTranscodeStartForFile,
    resolvePreferTranscode,
    resetAudioTracks,
    setAbsoluteCurrentSeconds,
    setBootstrapLoading,
    setBootstrapped,
    setFileSwitching,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    setSelectedFileIndex,
    setSelectedSubtitleId,
    setStatusSnapshot,
    setTranscodeStartOffsetSeconds,
    setVideoDuration,
    activeStreamConfigKeyRef,
    autoResumeWhenPlayableRef,
    bootstrapRunTokenRef,
    fileSwitchingRef,
    pendingRequestedFileIndexRef,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    statusSnapshotRef,
    totalDurationSecondsRef,
    trackPreferencesHydratedKeyRef,
    transcodeStartOffsetRef,
    userPausedRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    logError,
    logInfo
  });

  useTorrentPlayerLifecycle({
    t,
    infoHash,
    bootstrapped,
    activePreferTranscode,
    fileOptions,
    selectedFileIndex,
    requestedFileIndex,
    statusSnapshot,
    totalDurationSeconds,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    applyStreamUrl,
    bootstrapPlayer,
    buildHLSPlaylistOptions,
    handleSelectFile,
    loadServerAudioTracks,
    loadSubtitles,
    loadTorrentDetail,
    resolveAbsoluteCurrent,
    resolvePlayableTranscodeStartForFile,
    shouldAutoplayStreamChange,
    activeStreamConfigKeyRef,
    autoResumeWhenPlayableRef,
    initializedInfoHashRef,
    pendingRequestedFileIndexRef,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    statusSnapshotRef,
    totalDurationSecondsRef,
    transcodeStartOffsetRef,
    videoRef,
    logInfo,
    setAbsoluteCurrentSeconds,
    setPlaybackLoading,
    setPlayerError,
    setPlayerStatus,
    setTranscodeStartOffsetSeconds
  });

  useTorrentPlayerVideoState({
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
  });

  useTorrentPlayerPlaybackEvents({
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
    releaseCurrentHLSRef,
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
  });

  useEffect(() => {
    if (selectedSubtitleId === "none") return;
    if (subtitleItems.length === 0) return;
    const exists = subtitleItems.some((item) => String(item.id) === selectedSubtitleId);
    if (!exists) {
      setSelectedSubtitleId("none");
    }
  }, [selectedSubtitleId, setSelectedSubtitleId, subtitleItems]);

  useTorrentPlayerDomEffects({
    streamUrl,
    settingsOpen,
    inlineSettingsRef,
    playerStageRef,
    stageClickTimerRef,
    videoRef,
    setIsFullscreenActive,
    setIsPipActive,
    setSettingsOpen
  });

  const handleSeekCommit = useTorrentPlayerSeek({
    t,
    infoHash,
    activePreferTranscode,
    selectedFileOption,
    totalDurationSeconds,
    videoDuration,
    transcodePrebufferSeconds,
    applyStreamUrl,
    attemptResumePlayback,
    buildHLSPlaylistOptions,
    resolveBufferedAheadAtSeconds,
    resolvePlayableTranscodeStartForFile,
    autoResumeWhenPlayableRef,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    seekingSwitchingRef,
    statusSnapshotRef,
    transcodeSeekInFlightRef,
    transcodeStartOffsetRef,
    userPausedRef,
    videoRef,
    logInfo,
    logWarn,
    setAbsoluteCurrentSeconds,
    setPlaybackLoading,
    setPlayerStatus,
    setTranscodeStartOffsetSeconds
  });

  const {
    handleSetPlaybackRate,
    handleStageClickTogglePlayback,
    handleStageDoubleClickToggleFullscreen,
    handleToggleFullscreen,
    handleTogglePip,
    handleTogglePlaybackButton
  } = useTorrentPlayerPlaybackControls({
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
  });

  const {
    handleCycleVideoFitMode,
    handleOpenDiagnostics,
    handleOpenSubtitleManager,
    handleSelectFilePanel,
    handleSetSelectedSubtitleId,
    handleSettingsButtonClick
  } = useTorrentPlayerPanelHandlers({
    handleSelectFile,
    setDiagnosticsOpened,
    setSettingsOpen,
    setSubtitleManagerOpened,
    setSelectedSubtitleId,
    setVideoFitMode
  });

  const authoritativeDurationSeconds =
    statusSnapshot?.selectedFileIndex === selectedFileIndex
      ? statusSnapshot?.selectedFileDurationSeconds || 0
      : 0;
  const {
    activeSubtitleCue,
    displayedCurrentSeconds,
    knownTimelineSeconds,
    seekHoverThumbnail,
    seekMax,
    handleSeekChange,
    handleSeekHoverLeave,
    handleSeekHoverMove,
    handleSeekInput,
    handleSeekKeyUp,
    handleSeekPointerDown,
    handleSeekPreviewFailed,
    handleSeekPreviewLoaded
  } = useTorrentPlayerSeekUi({
    infoHash,
    selectedFileIndex,
    selectedFileOption,
    totalDurationSeconds,
    absoluteCurrentSeconds,
    activePreferTranscode,
    isSeekingDrag,
    seekDraftSeconds,
    seekHoverSeconds,
    selectedSubtitleItem,
    subtitleCueMap,
    handleSeekCommit,
    isSeekingDragRef,
    setAbsoluteCurrentSeconds,
    setIsSeekingDrag,
    setSeekDraftSeconds,
    setSeekHoverRatio,
    setSeekHoverSeconds,
    setSeekPreviewFailedKey,
    setSeekPreviewLoadedKey
  });

  const {
    resumePromptOpened,
    resumePromptSeconds,
    handleResumePromptContinue,
    handleResumePromptRestart
  } = useTorrentPlayerResumePrompt({
    infoHash,
    userId: user?.id,
    bootstrapped,
    videoDuration,
    selectedFileIndexRef,
    totalDurationSecondsRef,
    resolveAbsoluteCurrent,
    prepareContinue: () => {
      userPausedRef.current = false;
      autoResumeWhenPlayableRef.current = true;
      setPlaybackLoading(true);
      setPlayerStatus("buffering");
      setIsVideoPaused(false);
    },
    onContinueOtherFile: async (fileIndex, seconds) => {
      await handleSelectFile(fileIndex, "panel", {
        resumeAt: seconds,
        autoplay: true
      });
    },
    onContinueSameFile: async (seconds) => {
      await handleSeekCommit(seconds, "panel");
    }
  });

  const {
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
  } = useTorrentPlayerViewModel({
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
  });

  const { controlsActive, revealInlineControls } = useTorrentPlayerInlineControls({
    isFullscreenActive,
    shouldKeepInlineControlsVisible
  });
  useEffect(() => {
    revealInlineControlsRef.current = revealInlineControls;
  }, [revealInlineControls, revealInlineControlsRef]);
  const inlineControlsVisible = !isFullscreenActive || shouldKeepInlineControlsVisible || controlsActive;

  return (
    <TorrentPlayerPageRender
      base={{ t, detail, infoHash, playerError, formatClock, formatBytes, formatSpeed }}
      state={{
        canInitializePlayer, isVideoPaused, isFullscreenActive, inlineControlsVisible, isPipActive,
        settingsOpen, activePreferTranscode, streamUrl, selectedFileIndex, fileSwitching, fileOptions,
        seekHoverSeconds, seekHoverRatio, seekPreviewLoadedKey, seekPreviewFailedKey, videoFitMode,
        videoPlaybackRate, transcodeOutputResolution, transcodePrebufferSeconds, audioTrackSelectionAvailable,
        audioTrackOptions, selectedAudioTrackId, selectedSubtitleId, subtitleTrackOptions, statusSnapshot
      }}
      viewModel={{
        playbackStatusLabel, transferStatusLabel, playbackPositionLabel, stageBootstrapLoading,
        showPlaybackBusyOverlay, networkCacheLabel, isDownloadComplete, isDownloading, downloadTaskProgress,
        downloadedRatio, playableRatio, contiguousRatio, playedRatio, sourceResolutionLabel, outputResolutionLabel,
        detailPublishedLabel, detailTagPreview, detailSourceLabel, mediaTitleDisplay, playerStageStyle,
        subtitleOverlayStyle, availableRanges
      }}
      refs={{ playerStageRef, inlineSettingsRef, videoRef }}
      seek={{ activeSubtitleCue, seekHoverThumbnail, seekMax, displayedCurrentSeconds }}
      options={{ playbackRateOptions, transcodeResolutionOptions }}
      handlers={{
        onOpenDiagnostics: handleOpenDiagnostics,
        onStageClickTogglePlayback: handleStageClickTogglePlayback,
        onStageDoubleClickToggleFullscreen: handleStageDoubleClickToggleFullscreen,
        onTogglePlayback: handleTogglePlaybackButton,
        onSeekHoverMove: handleSeekHoverMove,
        onSeekHoverLeave: handleSeekHoverLeave,
        onSeekPointerDown: handleSeekPointerDown,
        onSeekInput: handleSeekInput,
        onSeekChange: handleSeekChange,
        onSeekKeyUp: handleSeekKeyUp,
        onCycleVideoFitMode: handleCycleVideoFitMode,
        onSettingsButtonClick: handleSettingsButtonClick,
        onSetPlaybackRate: handleSetPlaybackRate,
        onSetTranscodeOutputResolution: handleSetTranscodeOutputResolution,
        onSetTranscodePrebufferSeconds: setTranscodePrebufferSeconds,
        onSetAudioTrackId: setSelectedAudioTrackId,
        onOpenSubtitleManager: handleOpenSubtitleManager,
        onTogglePip: handleTogglePip,
        onToggleFullscreen: handleToggleFullscreen,
        onSelectFile: handleSelectFilePanel,
        onSetSelectedSubtitleId: handleSetSelectedSubtitleId,
        onSeekPreviewLoaded: handleSeekPreviewLoaded,
        onSeekPreviewFailed: handleSeekPreviewFailed
      }}
      overlays={{
        t,
        formatClock,
        formatSubtitleOffsetLabel,
        subtitleManagerOpened,
        subtitleManagerTab,
        setSubtitleManagerOpened,
        setSubtitleManagerTab,
        subtitleItems,
        subtitleSiteLinks,
        subtitleLoading,
        subtitleUploadInputRef,
        onSubtitleUploadPick: handleSubtitleUploadPick,
        onAdjustSubtitleOffset: handleAdjustSubtitleOffset,
        onDeleteSubtitle: handleDeleteSubtitle,
        subtitleStylePreset,
        setSubtitleStylePreset,
        subtitleScaleOptions,
        resumePromptOpened,
        resumePromptSeconds,
        onResumePromptRestart: handleResumePromptRestart,
        onResumePromptContinue: handleResumePromptContinue,
        diagnosticsOpened,
        diagnostics,
        setDiagnostics,
        onCopyLogs: handleCopyLogs,
        onCloseDiagnostics: () => setDiagnosticsOpened(false)
      }}
    />
  );
}

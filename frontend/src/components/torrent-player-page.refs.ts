"use client";

import { useRef } from "react";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type HlsLike = player.HlsLike;
type PlayerStatus = player.PlayerStatus;

export function useTorrentPlayerRefs(t: (key: string) => string) {
  return {
    videoRef: useRef<HTMLVideoElement | null>(null),
    playerStageRef: useRef<HTMLDivElement | null>(null),
    inlineSettingsRef: useRef<HTMLDivElement | null>(null),
    transcodeSeekInFlightRef: useRef(false),
    pendingTranscodeSeekDisplayRef: useRef<{ target: number; at: number } | null>(null),
    isSeekingDragRef: useRef(false),
    initializedInfoHashRef: useRef(""),
    subtitleLoadTokenRef: useRef(0),
    audioTrackLoadTokenRef: useRef(0),
    hlsRef: useRef<HlsLike | null>(null),
    hlsStartupAtRef: useRef(0),
    hlsLastActivityAtRef: useRef(0),
    hlsLastFragmentBufferedAtRef: useRef(0),
    hlsLastMediaRecoveryAtRef: useRef(0),
    hlsSuspendedRef: useRef(false),
    hlsReleasedForPauseRef: useRef(false),
    userPausedRef: useRef(false),
    activeStreamConfigKeyRef: useRef(""),
    selectedFileIndexRef: useRef(-1),
    fileSwitchingRef: useRef(false),
    streamUrlRef: useRef(""),
    streamRetryRef: useRef<{ key: string; attempts: number }>({ key: "", attempts: 0 }),
    streamRetryTimerRef: useRef<number | null>(null),
    lastStreamRetryAtRef: useRef(0),
    retryCurrentStreamRef: useRef<(reason: string) => boolean>(() => false),
    releaseCurrentHLSRef: useRef<(reason: string, keepalive?: boolean) => void>(() => {}),
    pauseCurrentHLSLoadRef: useRef<(paused: boolean) => void>(() => {}),
    stageClickTimerRef: useRef<number | null>(null),
    streamApplyOptionsRef: useRef<{ resumeAt?: number; autoplay?: boolean; recovery?: boolean }>({}),
    activePreferTranscodeRef: useRef(false),
    statusSnapshotRef: useRef<PlayerTransmissionStatusResponse | null>(null),
    totalDurationSecondsRef: useRef(0),
    transcodeStartOffsetRef: useRef(0),
    absoluteCurrentSecondsRef: useRef(0),
    lastPlaybackProgressRef: useRef<{ at: number; seconds: number }>({ at: 0, seconds: 0 }),
    stallStartedAtRef: useRef(0),
    lastAutoRecoveryAtRef: useRef(0),
    seekingSwitchingRef: useRef(false),
    subtitleUploadInputRef: useRef<HTMLInputElement | null>(null),
    selectedAudioTrackQueryIndexRef: useRef(-1),
    tRef: useRef(t),
    logWarnRef: useRef<(step: string, message: string, details?: unknown) => void>(() => {}),
    bootstrapRunTokenRef: useRef(0),
    pendingResumeTargetRef: useRef<number | null>(null),
    autoResumeWhenPlayableRef: useRef(false),
    globalPreferencesHydratedRef: useRef(false),
    trackPreferencesHydratedKeyRef: useRef(""),
    revealControlsTimerRef: useRef<number | null>(null),
    revealInlineControlsRef: useRef<(delayMs?: number) => void>(() => {}),
    playbackLoadingRef: useRef(false),
    playerStatusRef: useRef<PlayerStatus>("idle")
  };
}

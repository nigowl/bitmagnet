"use client";

import { useEffect, type MutableRefObject } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

type HlsLike = player.HlsLike;

type UseTorrentPlayerHousekeepingArgs = {
  infoHash: string;
  selectedFileIndex: number;
  absoluteCurrentSeconds: number;
  isSeekingDrag: boolean;
  isSeekingDragRef: MutableRefObject<boolean>;
  absoluteCurrentSecondsRef: MutableRefObject<number>;
  streamRetryTimerRef: MutableRefObject<number | null>;
  revealControlsTimerRef: MutableRefObject<number | null>;
  hlsRef: MutableRefObject<HlsLike | null>;
  initializedInfoHashRef: MutableRefObject<string>;
  subtitleLoadTokenRef: MutableRefObject<number>;
  bootstrapRunTokenRef: MutableRefObject<number>;
  streamRetryRef: MutableRefObject<{ key: string; attempts: number }>;
  lastStreamRetryAtRef: MutableRefObject<number>;
  lastAutoRecoveryAtRef: MutableRefObject<number>;
  stallStartedAtRef: MutableRefObject<number>;
  lastPlaybackProgressRef: MutableRefObject<{ at: number; seconds: number }>;
  resetSubtitles: () => void;
  resetAudioTracks: () => void;
  setVideoSourceHeight: (value: number) => void;
};

export function useTorrentPlayerHousekeeping({
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
}: UseTorrentPlayerHousekeepingArgs) {
  useEffect(() => {
    isSeekingDragRef.current = isSeekingDrag;
  }, [isSeekingDrag, isSeekingDragRef]);

  useEffect(() => {
    absoluteCurrentSecondsRef.current = absoluteCurrentSeconds;
  }, [absoluteCurrentSeconds, absoluteCurrentSecondsRef]);

  useEffect(() => {
    return () => {
      if (streamRetryTimerRef.current !== null) {
        window.clearTimeout(streamRetryTimerRef.current);
        streamRetryTimerRef.current = null;
      }
      if (revealControlsTimerRef.current !== null) {
        window.clearTimeout(revealControlsTimerRef.current);
        revealControlsTimerRef.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
      initializedInfoHashRef.current = "";
      subtitleLoadTokenRef.current += 1;
      bootstrapRunTokenRef.current += 1;
    };
  }, [
    bootstrapRunTokenRef,
    hlsRef,
    initializedInfoHashRef,
    revealControlsTimerRef,
    streamRetryTimerRef,
    subtitleLoadTokenRef
  ]);

  useEffect(() => {
    subtitleLoadTokenRef.current += 1;
    streamRetryRef.current = { key: "", attempts: 0 };
    lastStreamRetryAtRef.current = 0;
    lastAutoRecoveryAtRef.current = 0;
    stallStartedAtRef.current = 0;
    lastPlaybackProgressRef.current = { at: 0, seconds: 0 };
    resetSubtitles();
    resetAudioTracks();
  }, [
    infoHash,
    lastAutoRecoveryAtRef,
    lastPlaybackProgressRef,
    lastStreamRetryAtRef,
    resetAudioTracks,
    resetSubtitles,
    stallStartedAtRef,
    streamRetryRef,
    subtitleLoadTokenRef
  ]);

  useEffect(() => {
    setVideoSourceHeight(0);
  }, [infoHash, selectedFileIndex, setVideoSourceHeight]);
}

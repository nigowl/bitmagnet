"use client";

import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

type PlaybackProgressRecord = player.PlaybackProgressRecord;

type UseTorrentPlayerResumePromptArgs = {
  infoHash: string;
  userId?: number;
  bootstrapped: boolean;
  videoDuration: number;
  selectedFileIndexRef: MutableRefObject<number>;
  totalDurationSecondsRef: MutableRefObject<number>;
  resolveAbsoluteCurrent: () => number;
  onContinueSameFile: (seconds: number) => Promise<void>;
  onContinueOtherFile: (fileIndex: number, seconds: number) => Promise<void>;
  prepareContinue: () => void;
};

export function useTorrentPlayerResumePrompt({
  infoHash,
  userId,
  bootstrapped,
  videoDuration,
  selectedFileIndexRef,
  totalDurationSecondsRef,
  resolveAbsoluteCurrent,
  onContinueSameFile,
  onContinueOtherFile,
  prepareContinue
}: UseTorrentPlayerResumePromptArgs) {
  const [resumePromptOpened, setResumePromptOpened] = useState(false);
  const [resumePromptSeconds, setResumePromptSeconds] = useState(0);
  const [resumePromptFileIndex, setResumePromptFileIndex] = useState(-1);

  useEffect(() => {
    if (!infoHash) return;
    const timer = window.setTimeout(() => {
      const record = player.readPlaybackProgressRecord(infoHash, userId);
      const seconds = Number.isFinite(record?.seconds) ? Math.max(0, Number(record?.seconds)) : 0;
      const fileIndex = Number.isInteger(record?.fileIndex) ? Number(record?.fileIndex) : -1;
      if (seconds < 15) {
        setResumePromptSeconds(0);
        setResumePromptFileIndex(-1);
        setResumePromptOpened(false);
        return;
      }
      setResumePromptSeconds(seconds);
      setResumePromptFileIndex(fileIndex);
      setResumePromptOpened(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [infoHash, userId]);

  useEffect(() => {
    if (!infoHash || !bootstrapped) return;
    const saveProgress = () => {
      const seconds = Math.max(0, resolveAbsoluteCurrent());
      if (!Number.isFinite(seconds) || seconds < 1) return;
      const duration = Math.max(0, totalDurationSecondsRef.current, videoDuration);
      const payload: PlaybackProgressRecord = {
        infoHash,
        fileIndex: selectedFileIndexRef.current,
        seconds,
        duration,
        updatedAt: Date.now()
      };
      player.writePlaybackProgressRecord(payload, userId);
    };
    const timer = window.setInterval(saveProgress, player.PLAYBACK_PROGRESS_SAVE_MS);
    const saveBeforePageExit = () => saveProgress();
    window.addEventListener("pagehide", saveBeforePageExit);
    window.addEventListener("beforeunload", saveBeforePageExit);
    document.addEventListener("visibilitychange", saveBeforePageExit);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", saveBeforePageExit);
      window.removeEventListener("beforeunload", saveBeforePageExit);
      document.removeEventListener("visibilitychange", saveBeforePageExit);
    };
  }, [bootstrapped, infoHash, resolveAbsoluteCurrent, selectedFileIndexRef, totalDurationSecondsRef, userId, videoDuration]);

  const handleResumePromptContinue = useCallback(async () => {
    setResumePromptOpened(false);
    prepareContinue();
    if (resumePromptFileIndex >= 0 && resumePromptFileIndex !== selectedFileIndexRef.current) {
      await onContinueOtherFile(resumePromptFileIndex, resumePromptSeconds);
      return;
    }
    await onContinueSameFile(resumePromptSeconds);
  }, [onContinueOtherFile, onContinueSameFile, prepareContinue, resumePromptFileIndex, resumePromptSeconds, selectedFileIndexRef]);

  return {
    resumePromptOpened,
    resumePromptSeconds,
    handleResumePromptContinue
  };
}

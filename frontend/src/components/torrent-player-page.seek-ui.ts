"use client";

import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction, type MouseEvent as ReactMouseEvent } from "react";
import { buildPlayerTransmissionThumbnailURL } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlaybackFileOption = player.PlaybackFileOption;
type SubtitleCue = player.SubtitleCue;

type UseTorrentPlayerSeekUiArgs = {
  infoHash: string;
  selectedFileIndex: number;
  selectedFileOption: PlaybackFileOption | null;
  totalDurationSeconds: number;
  absoluteCurrentSeconds: number;
  activePreferTranscode: boolean;
  isSeekingDrag: boolean;
  seekDraftSeconds: number | null;
  seekHoverSeconds: number | null;
  selectedSubtitleItem: { id: string | number } | null;
  subtitleCueMap: Record<string | number, SubtitleCue[]>;
  handleSeekCommit: (targetSecondsInput: number, source?: "panel" | "native") => Promise<void>;
  isSeekingDragRef: MutableRefObject<boolean>;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setIsSeekingDrag: Dispatch<SetStateAction<boolean>>;
  setSeekDraftSeconds: Dispatch<SetStateAction<number | null>>;
  setSeekHoverRatio: Dispatch<SetStateAction<number>>;
  setSeekHoverSeconds: Dispatch<SetStateAction<number | null>>;
  setSeekPreviewFailedKey: Dispatch<SetStateAction<string>>;
  setSeekPreviewLoadedKey: Dispatch<SetStateAction<string>>;
};

export function useTorrentPlayerSeekUi({
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
}: UseTorrentPlayerSeekUiArgs) {
  const knownTimelineSeconds = totalDurationSeconds;
  const totalTimelineSeconds = Math.max(knownTimelineSeconds, absoluteCurrentSeconds);
  const seekMax = totalTimelineSeconds > 0 ? totalTimelineSeconds : 1;

  const seekHoverThumbnail = useMemo(() => {
    if (seekHoverSeconds === null || !infoHash || selectedFileIndex < 0 || !selectedFileOption) {
      return null;
    }
    const seconds = Math.max(0, Math.min(seekMax, seekHoverSeconds));
    const quantizedSeconds = Math.max(0, Math.round(seconds / 10) * 10);
    const startBytes = player.estimateTranscodeStartBytes(quantizedSeconds, seekMax, selectedFileOption.length);
    const key = `${selectedFileIndex}:${quantizedSeconds}:${startBytes}`;
    return {
      key,
      url: buildPlayerTransmissionThumbnailURL(infoHash, selectedFileIndex, quantizedSeconds, key, { startBytes })
    };
  }, [infoHash, seekHoverSeconds, seekMax, selectedFileIndex, selectedFileOption]);

  const displayedCurrentSeconds = Math.max(
    0,
    Math.min(seekMax, isSeekingDrag ? (seekDraftSeconds ?? absoluteCurrentSeconds) : absoluteCurrentSeconds)
  );
  const subtitleDisplaySeconds = activePreferTranscode
    ? Math.max(0, displayedCurrentSeconds)
    : displayedCurrentSeconds;
  const activeSubtitleCue = selectedSubtitleItem
    ? (subtitleCueMap[selectedSubtitleItem.id] || []).find((cue) =>
        subtitleDisplaySeconds + 0.05 >= cue.start && subtitleDisplaySeconds < cue.end
      ) || null
    : null;

  useEffect(() => {
    if (isSeekingDrag) return;
    setSeekDraftSeconds(null);
  }, [displayedCurrentSeconds, isSeekingDrag, setSeekDraftSeconds]);

  const commitInlineSeek = useCallback(
    (nextValue?: number | null) => {
      const raw = Number.isFinite(Number(nextValue)) ? Number(nextValue) : absoluteCurrentSeconds;
      const clamped = Math.max(0, Math.min(seekMax, raw));
      isSeekingDragRef.current = false;
      setIsSeekingDrag(false);
      setSeekDraftSeconds(clamped);
      if (Math.abs(clamped - absoluteCurrentSeconds) < 0.15) {
        return;
      }
      setAbsoluteCurrentSeconds(clamped);
      void handleSeekCommit(clamped, "panel");
    },
    [
      absoluteCurrentSeconds,
      handleSeekCommit,
      isSeekingDragRef,
      seekMax,
      setAbsoluteCurrentSeconds,
      setIsSeekingDrag,
      setSeekDraftSeconds
    ]
  );

  const handleSeekHoverMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setSeekHoverRatio(ratio);
    setSeekHoverSeconds(seekMax * ratio);
  }, [seekMax, setSeekHoverRatio, setSeekHoverSeconds]);

  const handleSeekHoverLeave = useCallback(() => {
    setSeekHoverSeconds(null);
    setSeekPreviewFailedKey("");
    setSeekPreviewLoadedKey("");
  }, [setSeekHoverSeconds, setSeekPreviewFailedKey, setSeekPreviewLoadedKey]);

  const handleSeekPointerDown = useCallback(() => {
    isSeekingDragRef.current = true;
    setIsSeekingDrag(true);
    setSeekDraftSeconds(displayedCurrentSeconds);
  }, [displayedCurrentSeconds, isSeekingDragRef, setIsSeekingDrag, setSeekDraftSeconds]);

  const handleSeekInput = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    isSeekingDragRef.current = true;
    setIsSeekingDrag(true);
    setSeekDraftSeconds(value);
  }, [isSeekingDragRef, setIsSeekingDrag, setSeekDraftSeconds]);

  const handleSeekChange = useCallback((value: number) => {
    commitInlineSeek(value);
  }, [commitInlineSeek]);

  const handleSeekKeyUp = useCallback((value: number, key: string) => {
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End" && key !== "PageUp" && key !== "PageDown") {
      return;
    }
    commitInlineSeek(value);
  }, [commitInlineSeek]);

  const handleSeekPreviewLoaded = useCallback((key: string) => {
    setSeekPreviewLoadedKey(key);
  }, [setSeekPreviewLoadedKey]);

  const handleSeekPreviewFailed = useCallback((key: string) => {
    setSeekPreviewLoadedKey("");
    setSeekPreviewFailedKey(key);
  }, [setSeekPreviewFailedKey, setSeekPreviewLoadedKey]);

  return {
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
  };
}

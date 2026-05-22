"use client";

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type SubtitleStylePreset = player.SubtitleStylePreset;

type UseTorrentPlayerOptionsArgs = {
  t: TFunction;
  fileOptions: player.PlaybackFileOption[];
  selectedFileIndex: number;
  videoSourceHeight: number;
  subtitleItems: Array<{ id: string | number; label?: string; language?: string }>;
  selectedSubtitleId: string;
  transcodeOutputResolution: number;
  subtitleStylePreset: SubtitleStylePreset;
  setTranscodeOutputResolution: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerOptions({
  t,
  fileOptions,
  selectedFileIndex,
  videoSourceHeight,
  subtitleItems,
  selectedSubtitleId,
  transcodeOutputResolution,
  subtitleStylePreset,
  setTranscodeOutputResolution
}: UseTorrentPlayerOptionsArgs) {
  const subtitleTrackOptions = useMemo(
    () => [
      { value: "none", label: t("media.player.subtitleNone") },
      ...subtitleItems.map((item) => ({
        value: String(item.id),
        label: `${item.label || `Subtitle ${item.id}`}${item.language ? ` (${item.language})` : ""}`
      }))
    ],
    [subtitleItems, t]
  );

  const selectedSubtitleItem = useMemo(
    () => selectedSubtitleId === "none"
      ? null
      : subtitleItems.find((item) => String(item.id) === selectedSubtitleId) || null,
    [selectedSubtitleId, subtitleItems]
  );

  const playbackRateOptions = useMemo(() => [...player.PLAYBACK_RATE_OPTIONS], []);
  const transcodeResolutionOptions = useMemo(
    () => {
      const selectedResolutionLabel = fileOptions.find((item) => item.index === selectedFileIndex)?.resolutionLabel;
      const byLabel = player.parseResolutionValue(selectedResolutionLabel);
      const byVideo = Number.isFinite(videoSourceHeight) && videoSourceHeight > 0 ? Math.round(videoSourceHeight) : 0;
      const candidates = [byLabel, byVideo].filter((value) => value > 0);
      const detectedSourceResolution = candidates.length > 0 ? Math.min(...candidates) : 0;
      const filteredValues =
        detectedSourceResolution > 0
          ? player.TRANSCODE_OUTPUT_RESOLUTION_OPTIONS.filter((value) => value <= 0 || value <= detectedSourceResolution)
          : player.TRANSCODE_OUTPUT_RESOLUTION_OPTIONS;
      return filteredValues.map((value) => ({
        value,
        label: value <= 0 ? t("media.player.resolutionOutputOriginal") : `${value}p`
      }));
    },
    [fileOptions, selectedFileIndex, t, videoSourceHeight]
  );

  useEffect(() => {
    if (transcodeOutputResolution <= 0) return;
    const exists = transcodeResolutionOptions.some((item) => item.value === transcodeOutputResolution);
    if (!exists) {
      setTranscodeOutputResolution(0);
    }
  }, [setTranscodeOutputResolution, transcodeOutputResolution, transcodeResolutionOptions]);

  return {
    playbackRateOptions,
    selectedSubtitleItem,
    subtitleScaleOptions: player.SUBTITLE_SCALE_OPTIONS,
    subtitleStylePreset,
    subtitleTrackOptions,
    transcodeResolutionOptions
  };
}

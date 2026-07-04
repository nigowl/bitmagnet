"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

type SubtitleStylePreset = player.SubtitleStylePreset;
type PlayerGlobalPreferences = player.PlayerGlobalPreferences;
type PlayerTrackPreferences = player.PlayerTrackPreferences;

const TRANSCODE_PREBUFFER_DEFAULT_SECONDS = player.TRANSCODE_PREBUFFER_DEFAULT_SECONDS;

type UseTorrentPlayerGlobalPreferencesArgs = {
  userId?: number;
  videoPlaybackRate: number;
  videoFitMode: "contain" | "cover" | "fill";
  transcodePrebufferSeconds: number;
  transcodeOutputResolution: number;
  subtitleStylePreset: SubtitleStylePreset;
  hydratedRef: MutableRefObject<boolean>;
  setVideoPlaybackRate: Dispatch<SetStateAction<number>>;
  setVideoFitMode: Dispatch<SetStateAction<"contain" | "cover" | "fill">>;
  setTranscodePrebufferSeconds: Dispatch<SetStateAction<number>>;
  setTranscodeOutputResolution: Dispatch<SetStateAction<number>>;
  setSubtitleStylePreset: Dispatch<SetStateAction<SubtitleStylePreset>>;
};

type UseTorrentPlayerTrackPreferencesArgs = {
  infoHash: string;
  selectedFileIndex: number;
  userId?: number;
  selectedSubtitleId: string;
  selectedAudioTrackId: string;
  hydratedKeyRef: MutableRefObject<string>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
  setSelectedAudioTrackId: Dispatch<SetStateAction<string>>;
};

const defaultSubtitleStylePreset: SubtitleStylePreset = {
  scale: 1.15,
  textColor: "#f6f9ff",
  backgroundColor: "rgba(0, 0, 0, 0.55)",
  verticalPercent: 0
};

export function useTorrentPlayerGlobalPreferences({
  userId,
  videoPlaybackRate,
  videoFitMode,
  transcodePrebufferSeconds,
  transcodeOutputResolution,
  subtitleStylePreset,
  hydratedRef,
  setVideoPlaybackRate,
  setVideoFitMode,
  setTranscodePrebufferSeconds,
  setTranscodeOutputResolution,
  setSubtitleStylePreset
}: UseTorrentPlayerGlobalPreferencesArgs) {
  useEffect(() => {
    hydratedRef.current = false;
    let hydrationTimer: number | null = null;
    const key = player.buildPlayerGlobalPreferencesStorageKey(userId);
    try {
      const raw = window.localStorage.getItem(key) || (userId ? window.localStorage.getItem(player.buildPlayerGlobalPreferencesStorageKey()) : null);
      if (!raw) {
        setVideoPlaybackRate(1);
        setVideoFitMode("contain");
        setTranscodePrebufferSeconds(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
        setTranscodeOutputResolution(0);
        setSubtitleStylePreset(defaultSubtitleStylePreset);
        return;
      }

      const parsed = JSON.parse(raw) as PlayerGlobalPreferences;
      setVideoPlaybackRate(player.normalizePlaybackRatePreference(Number(parsed?.playbackRate ?? 1)));
      setVideoFitMode(player.normalizeVideoFitModePreference(parsed?.videoFitMode));
      setTranscodePrebufferSeconds(player.normalizePrebufferPreference(Number(parsed?.transcodePrebufferSeconds ?? TRANSCODE_PREBUFFER_DEFAULT_SECONDS)));
      setTranscodeOutputResolution(player.normalizeTranscodeOutputResolution(Number(parsed?.outputResolution ?? 0)));
      setSubtitleStylePreset({
        scale: player.normalizeSubtitleScalePreference(Number(parsed?.subtitleStyleScale ?? 1.15)),
        textColor: typeof parsed?.subtitleStyleTextColor === "string" && parsed.subtitleStyleTextColor.trim()
          ? parsed.subtitleStyleTextColor
          : defaultSubtitleStylePreset.textColor,
        backgroundColor: typeof parsed?.subtitleStyleBackgroundColor === "string" && parsed.subtitleStyleBackgroundColor.trim()
          ? parsed.subtitleStyleBackgroundColor
          : defaultSubtitleStylePreset.backgroundColor,
        verticalPercent: player.normalizeSubtitleVerticalPercentPreference(Number(parsed?.subtitleStyleVerticalPercent ?? 0))
      });
    } catch {
      setVideoPlaybackRate(1);
      setVideoFitMode("contain");
      setTranscodePrebufferSeconds(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
      setTranscodeOutputResolution(0);
      setSubtitleStylePreset(defaultSubtitleStylePreset);
    } finally {
      hydrationTimer = window.setTimeout(() => {
        hydratedRef.current = true;
      }, 0);
    }
    return () => {
      if (hydrationTimer !== null) {
        window.clearTimeout(hydrationTimer);
      }
    };
  }, [hydratedRef, setSubtitleStylePreset, setTranscodeOutputResolution, setTranscodePrebufferSeconds, setVideoFitMode, setVideoPlaybackRate, userId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const key = player.buildPlayerGlobalPreferencesStorageKey(userId);
    const payload: PlayerGlobalPreferences = {
      playbackRate: player.normalizePlaybackRatePreference(videoPlaybackRate),
      videoFitMode: player.normalizeVideoFitModePreference(videoFitMode),
      transcodePrebufferSeconds: player.normalizePrebufferPreference(transcodePrebufferSeconds),
      outputResolution: player.normalizeTranscodeOutputResolution(transcodeOutputResolution),
      subtitleStyleScale: player.normalizeSubtitleScalePreference(subtitleStylePreset.scale),
      subtitleStyleTextColor: subtitleStylePreset.textColor,
      subtitleStyleBackgroundColor: subtitleStylePreset.backgroundColor,
      subtitleStyleVerticalPercent: player.normalizeSubtitleVerticalPercentPreference(subtitleStylePreset.verticalPercent)
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [hydratedRef, subtitleStylePreset.backgroundColor, subtitleStylePreset.scale, subtitleStylePreset.textColor, subtitleStylePreset.verticalPercent, transcodeOutputResolution, transcodePrebufferSeconds, userId, videoFitMode, videoPlaybackRate]);
}

export function useTorrentPlayerTrackPreferences({
  infoHash,
  selectedFileIndex,
  userId,
  selectedSubtitleId,
  selectedAudioTrackId,
  hydratedKeyRef,
  setSelectedSubtitleId,
  setSelectedAudioTrackId
}: UseTorrentPlayerTrackPreferencesArgs) {
  useEffect(() => {
    hydratedKeyRef.current = "";
    if (!infoHash || selectedFileIndex < 0) {
      setSelectedSubtitleId("none");
      setSelectedAudioTrackId("");
      return;
    }
    const key = player.buildPlayerTrackPreferencesStorageKey(infoHash, selectedFileIndex, userId);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerTrackPreferences;
        setSelectedSubtitleId(typeof parsed?.selectedSubtitleId === "string" ? parsed.selectedSubtitleId : "none");
        setSelectedAudioTrackId(typeof parsed?.selectedAudioTrackId === "string" ? parsed.selectedAudioTrackId : "");
      } else {
        setSelectedSubtitleId("none");
        setSelectedAudioTrackId("");
      }
    } catch {
      setSelectedSubtitleId("none");
      setSelectedAudioTrackId("");
    } finally {
      hydratedKeyRef.current = key;
    }
  }, [hydratedKeyRef, infoHash, selectedFileIndex, setSelectedAudioTrackId, setSelectedSubtitleId, userId]);

  useEffect(() => {
    if (!infoHash || selectedFileIndex < 0) return;
    const key = player.buildPlayerTrackPreferencesStorageKey(infoHash, selectedFileIndex, userId);
    if (hydratedKeyRef.current !== key) return;
    const payload: PlayerTrackPreferences = {
      selectedSubtitleId,
      selectedAudioTrackId
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [hydratedKeyRef, infoHash, selectedAudioTrackId, selectedFileIndex, selectedSubtitleId, userId]);
}

"use client";

import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import {
  fetchPlayerTransmissionAudioTracks,
  type PlayerTransmissionAudioTrack
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type VideoWithAudioTracks = player.VideoWithAudioTracks;
type AudioTrackOption = { value: string; label: string; preference: number };

type UseTorrentPlayerAudioTracksArgs = {
  t: TFunction;
  infoHash: string;
  streamUrl: string;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  audioTrackLoadTokenRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
};

export function useTorrentPlayerAudioTracks({
  t,
  infoHash,
  streamUrl,
  videoRef,
  audioTrackLoadTokenRef,
  selectedFileIndexRef,
  selectedAudioTrackQueryIndexRef
}: UseTorrentPlayerAudioTracksArgs) {
  const [audioTrackOptions, setAudioTrackOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState("");
  const [audioTrackSelectionAvailable, setAudioTrackSelectionAvailable] = useState(false);
  const [serverAudioTracks, setServerAudioTracks] = useState<PlayerTransmissionAudioTrack[]>([]);

  const resetAudioTracks = useCallback(() => {
    audioTrackLoadTokenRef.current += 1;
    selectedAudioTrackQueryIndexRef.current = -1;
    setServerAudioTracks([]);
    setAudioTrackOptions([]);
    setAudioTrackSelectionAvailable(false);
    setSelectedAudioTrackId("");
  }, [audioTrackLoadTokenRef, selectedAudioTrackQueryIndexRef]);

  const selectedAudioTrackQueryIndex = useMemo(() => {
    if (!selectedAudioTrackId.startsWith("srv:")) return -1;
    const parsed = Number(selectedAudioTrackId.slice(4));
    if (!Number.isInteger(parsed) || parsed < 0) return -1;
    return serverAudioTracks.some((track) => track.index === parsed) ? parsed : -1;
  }, [selectedAudioTrackId, serverAudioTracks]);

  useEffect(() => {
    selectedAudioTrackQueryIndexRef.current = selectedAudioTrackQueryIndex;
  }, [selectedAudioTrackQueryIndex, selectedAudioTrackQueryIndexRef]);

  const loadServerAudioTracks = useCallback(
    async (fileIndex: number) => {
      const runToken = audioTrackLoadTokenRef.current + 1;
      audioTrackLoadTokenRef.current = runToken;
      selectedAudioTrackQueryIndexRef.current = -1;
      setServerAudioTracks([]);
      setAudioTrackOptions([]);
      setAudioTrackSelectionAvailable(false);

      if (!infoHash || !Number.isInteger(fileIndex) || fileIndex < 0) {
        return;
      }
      try {
        const tracks = await fetchPlayerTransmissionAudioTracks(infoHash, fileIndex);
        if (audioTrackLoadTokenRef.current !== runToken || selectedFileIndexRef.current !== fileIndex) {
          return;
        }
        setServerAudioTracks(tracks);
      } catch {
        if (audioTrackLoadTokenRef.current !== runToken || selectedFileIndexRef.current !== fileIndex) {
          return;
        }
        setServerAudioTracks([]);
      }
    },
    [audioTrackLoadTokenRef, infoHash, selectedAudioTrackQueryIndexRef, selectedFileIndexRef]
  );

  const refreshAudioTracks = useCallback(() => {
    const tracks = player.getNativeAudioTracks(videoRef.current as VideoWithAudioTracks | null);
    if (serverAudioTracks.length > 0) {
      const options: AudioTrackOption[] = [];
      for (const track of serverAudioTracks) {
        const parts = [String(track.label || "").trim()];
        const language = String(track.language || "").trim();
        if (language) {
          parts.push(language.toUpperCase());
        }
        const codec = String(track.codec || "").trim();
        if (codec) {
          parts.push(codec.toUpperCase());
        }
        if (Number.isFinite(track.channels) && track.channels > 0) {
          parts.push(`${track.channels}ch`);
        }
        const value = `srv:${track.index}`;
        options.push({
          value,
          label: parts.filter((item) => item).join(" · ") || `${t("media.player.audioTrackDefault")} ${track.index + 1}`,
          preference: resolveAudioTrackPreference([track.language, track.label], track.default)
        });
      }
      const defaultValue = pickPreferredAudioTrackValue(options);
      setAudioTrackSelectionAvailable(options.length > 0);
      setAudioTrackOptions(options.map(({ value, label }) => ({ value, label })));
      setSelectedAudioTrackId((current) => {
        if (current && options.some((item) => item.value === current)) {
          return current;
        }
        return defaultValue;
      });
      return;
    }

    if (!tracks || tracks.length <= 0) {
      setAudioTrackSelectionAvailable(false);
      setAudioTrackOptions([]);
      return;
    }

    const nextOptions: AudioTrackOption[] = [];
    for (let idx = 0; idx < tracks.length; idx += 1) {
      const track = tracks[idx];
      const key = player.audioTrackSelectionKey(track, idx);
      const labelParts = [String(track?.label || "").trim()];
      const language = String(track?.language || "").trim();
      if (language) {
        labelParts.push(language.toUpperCase());
      }
      const kind = String(track?.kind || "").trim();
      if (kind) {
        labelParts.push(kind);
      }
      const cleanParts = labelParts.filter((item) => item);
      const label = cleanParts.length > 0 ? cleanParts.join(" · ") : `${t("media.player.audioTrackDefault")} ${idx + 1}`;
      nextOptions.push({
        value: key,
        label,
        preference: resolveAudioTrackPreference([track?.language, track?.label, track?.kind], Boolean(track?.enabled))
      });
    }
    const enabledKey = pickPreferredAudioTrackValue(nextOptions);

    setAudioTrackSelectionAvailable(nextOptions.length > 0);
    setAudioTrackOptions(nextOptions.map(({ value, label }) => ({ value, label })));
    setSelectedAudioTrackId((current) => {
      if (current && nextOptions.some((item) => item.value === current)) {
        return current;
      }
      return enabledKey;
    });
  }, [serverAudioTracks, t, videoRef]);

  const syncSelectedAudioTrack = useCallback(() => {
    if (selectedAudioTrackId.startsWith("srv:")) {
      return;
    }
    const tracks = player.getNativeAudioTracks(videoRef.current as VideoWithAudioTracks | null);
    if (!tracks || tracks.length <= 0) return;

    let targetIndex = -1;
    if (selectedAudioTrackId) {
      for (let idx = 0; idx < tracks.length; idx += 1) {
        if (player.audioTrackSelectionKey(tracks[idx], idx) === selectedAudioTrackId) {
          targetIndex = idx;
          break;
        }
      }
    }
    if (targetIndex < 0) {
      for (let idx = 0; idx < tracks.length; idx += 1) {
        if (tracks[idx]?.enabled) {
          targetIndex = idx;
          break;
        }
      }
    }
    if (targetIndex < 0) {
      targetIndex = 0;
    }
    for (let idx = 0; idx < tracks.length; idx += 1) {
      const track = tracks[idx];
      if (!track) continue;
      track.enabled = idx === targetIndex;
    }
  }, [selectedAudioTrackId, videoRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshAudioTracks();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshAudioTracks, streamUrl]);

  useEffect(() => {
    syncSelectedAudioTrack();
  }, [selectedAudioTrackId, streamUrl, syncSelectedAudioTrack]);

  useEffect(() => {
    const tracks = player.getNativeAudioTracks(videoRef.current as VideoWithAudioTracks | null);
    if (!tracks) return;
    if (typeof tracks.addEventListener !== "function" || typeof tracks.removeEventListener !== "function") {
      return;
    }

    const onChange: EventListener = () => {
      refreshAudioTracks();
    };
    tracks.addEventListener("change", onChange);
    tracks.addEventListener("addtrack", onChange);
    tracks.addEventListener("removetrack", onChange);
    return () => {
      tracks.removeEventListener?.("change", onChange);
      tracks.removeEventListener?.("addtrack", onChange);
      tracks.removeEventListener?.("removetrack", onChange);
    };
  }, [refreshAudioTracks, streamUrl, videoRef]);

  return {
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
  };
}

function pickPreferredAudioTrackValue(options: AudioTrackOption[]): string {
  return [...options].sort((left, right) => left.preference - right.preference)[0]?.value || "";
}

function resolveAudioTrackPreference(values: Array<string | undefined>, isDefault: boolean): number {
  const haystack = values.map((value) => String(value || "").toLowerCase()).join(" ");
  if (/(^|[^a-z])(zh|zho|chi|cn|chinese|mandarin|cantonese|中文|国语|粤语)([^a-z]|$)/i.test(haystack)) return 0;
  if (/(^|[^a-z])(en|eng|english|英文)([^a-z]|$)/i.test(haystack)) return 1;
  return isDefault ? 2 : 3;
}

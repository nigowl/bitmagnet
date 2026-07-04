"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
import { getAuthToken } from "@/lib/api";
import { buildPlayerTransmissionHLSHeartbeatURL } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerHlsHeartbeatArgs = {
  infoHash: string;
  selectedFileIndex: number;
  activePreferTranscode: boolean;
  transcodeOutputResolution: number;
  activePreferTranscodeRef: MutableRefObject<boolean>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  hlsSuspendedRef: MutableRefObject<boolean>;
  playbackLoadingRef: MutableRefObject<boolean>;
  playerStatusRef: MutableRefObject<PlayerStatus>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  resolveAbsoluteCurrent: () => number;
  resolveHLSNetworkCacheAheadSeconds: () => number;
  logWarn: LogFn;
};

export function useTorrentPlayerHlsHeartbeat({
  infoHash,
  selectedFileIndex,
  activePreferTranscode,
  transcodeOutputResolution,
  activePreferTranscodeRef,
  autoResumeWhenPlayableRef,
  hlsSuspendedRef,
  playbackLoadingRef,
  playerStatusRef,
  selectedAudioTrackQueryIndexRef,
  selectedFileIndexRef,
  userPausedRef,
  videoRef,
  resolveAbsoluteCurrent,
  resolveHLSNetworkCacheAheadSeconds,
  logWarn
}: UseTorrentPlayerHlsHeartbeatArgs) {
  const sendHLSHeartbeat = useCallback((stateOverride?: "playing" | "paused" | "idle", keepalive = false) => {
    const index = selectedFileIndexRef.current;
    if (!infoHash || index < 0 || !activePreferTranscodeRef.current) return;

    const video = videoRef.current;
    const visible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
    const startingOrBuffering = autoResumeWhenPlayableRef.current ||
      playbackLoadingRef.current ||
      playerStatusRef.current === "buffering";
    const playbackActive = Boolean(
      visible &&
      !userPausedRef.current &&
      !hlsSuspendedRef.current &&
      (!video || !video.paused || startingOrBuffering)
    );
    const state = stateOverride || (playbackActive ? "playing" : "paused");
    const url = buildPlayerTransmissionHLSHeartbeatURL(infoHash, index, {
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution
    });
    const token = getAuthToken();
    void fetch(url, {
      method: "POST",
      credentials: "include",
      keepalive,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        state,
        visible,
        currentSeconds: Math.max(0, resolveAbsoluteCurrent()),
        networkCacheSeconds: Math.max(0, resolveHLSNetworkCacheAheadSeconds()),
        playbackRate: video && Number.isFinite(video.playbackRate) ? Math.max(1, video.playbackRate) : 1
      })
    }).catch((error) => {
      if (!keepalive) {
        logWarn("hls", "failed to send hls heartbeat", {
          state,
          message: player.toErrorMessage(error, "heartbeat failed")
        });
      }
    });
  }, [
    activePreferTranscodeRef,
    autoResumeWhenPlayableRef,
    hlsSuspendedRef,
    infoHash,
    logWarn,
    playbackLoadingRef,
    playerStatusRef,
    resolveAbsoluteCurrent,
    resolveHLSNetworkCacheAheadSeconds,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    transcodeOutputResolution,
    userPausedRef,
    videoRef
  ]);

  useEffect(() => {
    if (!infoHash || selectedFileIndex < 0 || !activePreferTranscode) return;

    const tick = () => sendHLSHeartbeat();
    tick();
    const timer = window.setInterval(tick, player.HLS_HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      sendHLSHeartbeat("idle", true);
    };
  }, [activePreferTranscode, infoHash, selectedFileIndex, sendHLSHeartbeat]);
}

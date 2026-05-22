"use client";

import { useCallback, useMemo, type MutableRefObject } from "react";
import {
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionStreamURL,
  type PlayerTransmissionAudioTrack,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TorrentDetailLite = player.TorrentDetailLite;
type PlaybackFileOption = player.PlaybackFileOption;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerStreamConfigArgs = {
  infoHash: string;
  detail: TorrentDetailLite | null;
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  fileOptions: PlaybackFileOption[];
  selectedFileIndex: number;
  selectedAudioTrackId: string;
  selectedAudioTrackQueryIndex: number;
  serverAudioTracks: PlayerTransmissionAudioTrack[];
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  videoDuration: number;
  bootstrapLoading: boolean;
  bootstrapped: boolean;
  streamUrl: string;
  selectedFileIndexRef: MutableRefObject<number>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  totalDurationSecondsRef: MutableRefObject<number>;
  logInfo: LogFn;
};

export function useTorrentPlayerStreamConfig({
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
}: UseTorrentPlayerStreamConfigArgs) {
  const selectedFileOption = useMemo(
    () => fileOptions.find((item) => item.index === selectedFileIndex) || null,
    [fileOptions, selectedFileIndex]
  );

  const resolvePreferTranscode = useCallback(
    (
      file: PlaybackFileOption | null = selectedFileOption,
      status: PlayerTransmissionStatusResponse | null = statusSnapshotRef.current
    ): boolean =>
      player.shouldPreferTranscodeForPlayback(
        file,
        status,
        transcodeOutputResolution,
        selectedAudioTrackId,
        serverAudioTracks
      ),
    [selectedAudioTrackId, selectedFileOption, serverAudioTracks, statusSnapshotRef, transcodeOutputResolution]
  );

  const buildTranscodeStreamOptions = useCallback(
    (overrides?: { audioTrackIndex?: number; startSeconds?: number; startBytes?: number; durationSeconds?: number }) => {
      const options: {
        transcode: true;
        audioTrackIndex: number;
        outputResolution?: number;
        startSeconds?: number;
        startBytes?: number;
      } = {
        transcode: true,
        audioTrackIndex:
          Number.isInteger(overrides?.audioTrackIndex) && (overrides?.audioTrackIndex ?? -1) >= -1
            ? Math.max(-1, Number(overrides?.audioTrackIndex))
            : selectedAudioTrackQueryIndex
      };
      if (transcodeOutputResolution > 0) {
        options.outputResolution = transcodeOutputResolution;
      }
      if (Number.isFinite(overrides?.startSeconds) && (overrides?.startSeconds || 0) > 0) {
        options.startSeconds = Math.max(0, overrides?.startSeconds || 0);
      }
      if (Number.isFinite(overrides?.startBytes) && (overrides?.startBytes || 0) > 0) {
        options.startBytes = Math.max(0, Math.floor(overrides?.startBytes || 0));
      }
      return options;
    },
    [selectedAudioTrackQueryIndex, transcodeOutputResolution]
  );

  const buildHLSPlaylistOptions = useCallback(
    (overrides?: { audioTrackIndex?: number; startSeconds?: number; startBytes?: number; durationSeconds?: number; prebufferSeconds?: number }) => {
      const base = buildTranscodeStreamOptions(overrides);
      const durationSeconds = Number.isFinite(overrides?.durationSeconds) && (overrides?.durationSeconds || 0) > 0
        ? Math.max(0, overrides?.durationSeconds || 0)
        : Math.max(0, totalDurationSecondsRef.current);
      const prebufferSeconds = Number.isFinite(overrides?.prebufferSeconds) && (overrides?.prebufferSeconds || 0) > 0
        ? Math.max(10, Math.floor(overrides?.prebufferSeconds || 0))
        : transcodePrebufferSeconds;
      return {
        audioTrackIndex: base.audioTrackIndex,
        outputResolution: base.outputResolution,
        startSeconds: base.startSeconds,
        startBytes: base.startBytes,
        prebufferSeconds,
        durationSeconds
      };
    },
    [buildTranscodeStreamOptions, totalDurationSecondsRef, transcodePrebufferSeconds]
  );

  const resolvePlayableTranscodeStartForFile = useCallback(
    (
      targetSeconds: number,
      totalDurationSeconds: number,
      file: { length: number },
      status: PlayerTransmissionStatusResponse | null | undefined,
      source: string
    ) => {
      const result = player.resolvePlayableTranscodeStart({
        targetSeconds,
        totalDurationSeconds,
        totalFileBytes: file.length,
        status,
        prebufferSeconds: transcodePrebufferSeconds
      });
      if (result.adjusted || result.prebufferSeconds < transcodePrebufferSeconds) {
        logInfo("file_cache", "resolve transcode start from available file cache range", {
          source,
          requestedSeconds: result.originalSeconds,
          adjustedSeconds: result.seconds,
          startBytes: result.startBytes,
          prebufferSeconds: result.prebufferSeconds,
          availableAheadSeconds: result.availableAheadSeconds,
          reason: result.reason,
          rangeStartRatio: result.range?.start,
          rangeEndRatio: result.range?.end
        });
      }
      return result;
    },
    [logInfo, transcodePrebufferSeconds]
  );

  const activePreferTranscode = useMemo(
    () => (selectedFileOption ? resolvePreferTranscode(selectedFileOption, statusSnapshot) : false),
    [resolvePreferTranscode, selectedFileOption, statusSnapshot]
  );

  const buildCurrentPlaybackStreamURL = useCallback(
    (cacheTag?: string) => {
      if (!infoHash) return "";
      const index = selectedFileIndexRef.current;
      if (!Number.isInteger(index) || index < 0) return "";
      const selected = fileOptions.find((item) => item.index === index);
      if (!selected) return "";
      const preferTranscode = resolvePreferTranscode(selected, statusSnapshotRef.current);
      const mode = preferTranscode ? "transcode" : "direct";
      const nextCacheTag = cacheTag || `${index}-${mode}-${preferTranscode ? "hls" : "direct"}-${Date.now()}`;
      return preferTranscode
        ? buildPlayerTransmissionHLSPlaylistURL(infoHash, index, nextCacheTag, buildHLSPlaylistOptions({ durationSeconds: totalDurationSecondsRef.current }))
        : buildPlayerTransmissionStreamURL(infoHash, index, nextCacheTag);
    },
    [buildHLSPlaylistOptions, fileOptions, infoHash, resolvePreferTranscode, selectedFileIndexRef, statusSnapshotRef, totalDurationSecondsRef]
  );

  const totalDurationSeconds = useMemo(() => {
    const meta = detail?.runtimeSeconds || 0;
    const probed =
      statusSnapshot?.selectedFileIndex === selectedFileIndex
        ? statusSnapshot?.selectedFileDurationSeconds || 0
        : 0;
    const media = Number.isFinite(videoDuration) ? Math.max(0, videoDuration) : 0;
    if (probed > 0) return probed;
    if (media > 0) return media;
    return meta;
  }, [detail?.runtimeSeconds, selectedFileIndex, statusSnapshot?.selectedFileDurationSeconds, statusSnapshot?.selectedFileIndex, videoDuration]);

  const canInitializePlayer =
    !bootstrapLoading &&
    bootstrapped &&
    fileOptions.length > 0 &&
    selectedFileIndex >= 0 &&
    Boolean(selectedFileOption) &&
    Boolean(streamUrl);

  return {
    activePreferTranscode,
    buildCurrentPlaybackStreamURL,
    buildHLSPlaylistOptions,
    canInitializePlayer,
    resolvePlayableTranscodeStartForFile,
    resolvePreferTranscode,
    selectedFileOption,
    totalDurationSeconds
  };
}

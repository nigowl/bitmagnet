"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { notifications } from "@mantine/notifications";
import { buildPlayerTransmissionHLSPlaylistURL, type PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type PlayerStatus = player.PlayerStatus;
type PlaybackFileOption = player.PlaybackFileOption;
type LogFn = (step: string, message: string, details?: unknown) => void;
type ApplyStreamUrl = (
  url: string,
  options?: { resumeAt?: number; autoplay?: boolean; recovery?: boolean; preload?: boolean }
) => void;
type BuildHLSPlaylistOptions = (overrides?: {
  audioTrackIndex?: number;
  startSeconds?: number;
  startBytes?: number;
  durationSeconds?: number;
  prebufferSeconds?: number;
}) => {
  audioTrackIndex: number;
  outputResolution?: number;
  startSeconds?: number;
  startBytes?: number;
  prebufferSeconds: number;
  durationSeconds: number;
};
type ResolvePlayableStart = (
  targetSeconds: number,
  totalDurationSeconds: number,
  file: { length: number },
  status: PlayerTransmissionStatusResponse | null | undefined,
  source: string
) => ReturnType<typeof player.resolvePlayableTranscodeStart>;

type UseTorrentPlayerSeekArgs = {
  t: TFunction;
  infoHash: string;
  activePreferTranscode: boolean;
  selectedFileOption: PlaybackFileOption | null;
  totalDurationSeconds: number;
  videoDuration: number;
  transcodePrebufferSeconds: number;
  applyStreamUrl: ApplyStreamUrl;
  attemptResumePlayback: (reason: string, targetSeconds?: number) => void;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  resolveBufferedAheadAtSeconds: (secondsInput?: number) => number;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  seekingSwitchingRef: MutableRefObject<boolean>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  transcodeSeekInFlightRef: MutableRefObject<boolean>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logInfo: LogFn;
  logWarn: LogFn;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerSeek({
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
}: UseTorrentPlayerSeekArgs) {
  return useCallback(
    async (targetSecondsInput: number, source: "panel" | "native" = "panel") => {
      const video = videoRef.current;
      if (!video || !infoHash || !selectedFileOption) return;
      if (!Number.isFinite(targetSecondsInput)) return;

      const fullDuration = totalDurationSeconds > 0 ? totalDurationSeconds : videoDuration;
      const clamped = Math.max(0, Math.min(fullDuration > 0 ? fullDuration : targetSecondsInput, targetSecondsInput));

      let releaseOnLoadedMetadata = false;
      try {
        seekingSwitchingRef.current = true;
        userPausedRef.current = false;
        if (activePreferTranscode) {
          const nativeTarget = clamped - transcodeStartOffsetRef.current;
          const bufferedAhead = resolveBufferedAheadAtSeconds(nativeTarget);
          if (nativeTarget >= 0 && bufferedAhead >= 0.5) {
            video.currentTime = nativeTarget;
            setAbsoluteCurrentSeconds(clamped);
            pendingTranscodeSeekDisplayRef.current = null;
            transcodeSeekInFlightRef.current = false;
            if (video.paused) {
              attemptResumePlayback("hls_cached_seek", clamped);
            } else {
              setPlaybackLoading(false);
              setPlayerStatus("playing");
            }
            logInfo("seek", "seek inside hls network cache", {
              source,
              targetSeconds: clamped,
              cacheAheadSeconds: bufferedAhead
            });
            return;
          }

          releaseOnLoadedMetadata = true;
          transcodeSeekInFlightRef.current = true;
          autoResumeWhenPlayableRef.current = true;
          setPlaybackLoading(true);
          setPlayerStatus("buffering");
          const playableStart = resolvePlayableTranscodeStartForFile(
            clamped,
            fullDuration,
            selectedFileOption,
            statusSnapshotRef.current,
            `seek:${source}`
          );
          const effectiveSeekSeconds = playableStart.seconds;
          pendingTranscodeSeekDisplayRef.current = { target: effectiveSeekSeconds, at: Date.now() };
          pendingResumeTargetRef.current = effectiveSeekSeconds;
          setAbsoluteCurrentSeconds(effectiveSeekSeconds);
          const startBytes = playableStart.startBytes;
          const seekUrl = buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selectedFileOption.index,
            `seek-${selectedFileOption.index}-${Math.floor(effectiveSeekSeconds * 10)}-${transcodePrebufferSeconds}`,
            buildHLSPlaylistOptions({
              startSeconds: effectiveSeekSeconds,
              startBytes,
              prebufferSeconds: playableStart.prebufferSeconds,
              durationSeconds: fullDuration
            })
          );
          setTranscodeStartOffsetSeconds(effectiveSeekSeconds);
          transcodeStartOffsetRef.current = effectiveSeekSeconds;
          pendingResumeTargetRef.current = effectiveSeekSeconds;
          autoResumeWhenPlayableRef.current = true;
          applyStreamUrl(seekUrl, { autoplay: true, resumeAt: 0 });
          logInfo("seek", "seek via transcode restart", {
            source,
            targetSeconds: effectiveSeekSeconds,
            requestedTargetSeconds: clamped,
            startBytes
          });
          return;
        }

        video.currentTime = clamped;
        setAbsoluteCurrentSeconds(clamped);
        attemptResumePlayback("seek", clamped);
        setTranscodeStartOffsetSeconds(0);
        transcodeStartOffsetRef.current = 0;
        pendingTranscodeSeekDisplayRef.current = null;
        logInfo("seek", "seek via native range request", { source, targetSeconds: clamped });
      } catch (error) {
        const message = player.toErrorMessage(error, t("media.player.playbackError"));
        transcodeSeekInFlightRef.current = false;
        pendingTranscodeSeekDisplayRef.current = null;
        autoResumeWhenPlayableRef.current = false;
        pendingResumeTargetRef.current = null;
        setPlaybackLoading(false);
        releaseOnLoadedMetadata = false;
        if (source === "panel") {
          notifications.show({ color: "red", message });
        }
        logWarn("seek", "seek failed", { targetSeconds: clamped, message });
      } finally {
        if (!releaseOnLoadedMetadata) {
          window.setTimeout(() => {
            seekingSwitchingRef.current = false;
          }, 50);
        }
      }
    },
    [
      activePreferTranscode,
      applyStreamUrl,
      attemptResumePlayback,
      buildHLSPlaylistOptions,
      infoHash,
      logInfo,
      logWarn,
      autoResumeWhenPlayableRef,
      pendingResumeTargetRef,
      pendingTranscodeSeekDisplayRef,
      resolveBufferedAheadAtSeconds,
      resolvePlayableTranscodeStartForFile,
      selectedFileOption,
      seekingSwitchingRef,
      setAbsoluteCurrentSeconds,
      setPlaybackLoading,
      setPlayerStatus,
      setTranscodeStartOffsetSeconds,
      statusSnapshotRef,
      t,
      totalDurationSeconds,
      transcodePrebufferSeconds,
      transcodeSeekInFlightRef,
      transcodeStartOffsetRef,
      userPausedRef,
      videoRef,
      videoDuration
    ]
  );
}

"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { notifications } from "@mantine/notifications";
import {
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionStreamURL,
  selectPlayerTransmissionFile,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type PlayerStatus = player.PlayerStatus;
type TorrentDetailLite = player.TorrentDetailLite;
type PlaybackFileOption = player.PlaybackFileOption;
type LogFn = (step: string, message: string, details?: unknown) => void;
type ApplyStreamUrl = (
  url: string,
  options?: { resumeAt?: number; autoplay?: boolean; recovery?: boolean }
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

type UseTorrentPlayerFileSelectArgs = {
  t: TFunction;
  infoHash: string;
  userId?: number;
  detail: TorrentDetailLite | null;
  applyFileOptions: (nextOptions: PlaybackFileOption[]) => void;
  applyStreamUrl: ApplyStreamUrl;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  resetAudioTracks: () => void;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  fileSwitchingRef: MutableRefObject<boolean>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  totalDurationSecondsRef: MutableRefObject<number>;
  trackPreferencesHydratedKeyRef: MutableRefObject<string>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  userPausedRef: MutableRefObject<boolean>;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  logError: LogFn;
  logInfo: LogFn;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setFileSwitching: Dispatch<SetStateAction<boolean>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setSelectedFileIndex: Dispatch<SetStateAction<number>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
  setStatusSnapshot: Dispatch<SetStateAction<PlayerTransmissionStatusResponse | null>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
  setVideoDuration: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerFileSelect({
  t,
  infoHash,
  userId,
  detail,
  applyFileOptions,
  applyStreamUrl,
  buildHLSPlaylistOptions,
  resolvePlayableTranscodeStartForFile,
  resetAudioTracks,
  activeStreamConfigKeyRef,
  autoResumeWhenPlayableRef,
  fileSwitchingRef,
  pendingResumeTargetRef,
  pendingTranscodeSeekDisplayRef,
  selectedAudioTrackQueryIndexRef,
  selectedFileIndexRef,
  statusSnapshotRef,
  totalDurationSecondsRef,
  trackPreferencesHydratedKeyRef,
  transcodeStartOffsetRef,
  userPausedRef,
  transcodeOutputResolution,
  transcodePrebufferSeconds,
  logError,
  logInfo,
  setAbsoluteCurrentSeconds,
  setFileSwitching,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus,
  setSelectedFileIndex,
  setSelectedSubtitleId,
  setStatusSnapshot,
  setTranscodeStartOffsetSeconds,
  setVideoDuration
}: UseTorrentPlayerFileSelectArgs) {
  return useCallback(
    async (
      nextIndex: number,
      source: "panel" | "native",
      options?: { resumeAt?: number; autoplay?: boolean }
    ) => {
      if (!infoHash || !Number.isInteger(nextIndex) || nextIndex < 0) return;
      if (selectedFileIndexRef.current === nextIndex) return;

      fileSwitchingRef.current = true;
      setFileSwitching(true);
      try {
        const resumeAt = Math.max(0, Number(options?.resumeAt || 0));
        const autoplay = options?.autoplay ?? true;
        const result = await selectPlayerTransmissionFile(infoHash, nextIndex);
        const nextOptions = player.buildPlaybackFileOptions(result.status.files || []);
        if (nextOptions.length === 0) throw new Error(t("media.player.noVideoFiles"));
        applyFileOptions(nextOptions);
        setStatusSnapshot(result.status);
        statusSnapshotRef.current = result.status;

        const selected =
          nextOptions.find((item) => item.index === nextIndex) ||
          nextOptions.find((item) => item.index === result.selectedFileIndex) ||
          nextOptions[0];
        if (!selected) throw new Error(t("media.player.noVideoFiles"));

        userPausedRef.current = false;
        setSelectedFileIndex(selected.index);
        selectedFileIndexRef.current = selected.index;
        trackPreferencesHydratedKeyRef.current = "";
        setSelectedSubtitleId("none");
        setVideoDuration(0);
        totalDurationSecondsRef.current = 0;
        resetAudioTracks();
        player.writeRememberedPlaybackFileIndex(infoHash, userId, selected.index);

        const preferTranscode = player.shouldPreferTranscodeForPlayback(
          selected,
          result.status,
          transcodeOutputResolution,
          "",
          []
        );
        const durationForStartBytes = Math.max(
          0,
          result.status.selectedFileDurationSeconds || 0,
          totalDurationSecondsRef.current,
          detail?.runtimeSeconds || 0
        );
        const playableStart = preferTranscode
          ? resolvePlayableTranscodeStartForFile(
            resumeAt,
            durationForStartBytes,
            selected,
            result.status,
            `select_file:${source}`
          )
          : null;
        const effectiveResumeAt = playableStart?.seconds ?? resumeAt;
        const startBytes = playableStart?.startBytes ?? 0;

        const nextUrl = preferTranscode
          ? buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selected.index,
            `${selected.index}-transcode-hls`,
            buildHLSPlaylistOptions({
              audioTrackIndex: -1,
              startSeconds: effectiveResumeAt,
              startBytes,
              prebufferSeconds: playableStart?.prebufferSeconds,
              durationSeconds: durationForStartBytes
            })
          )
          : buildPlayerTransmissionStreamURL(infoHash, selected.index, `${selected.index}-direct-direct`);
        setTranscodeStartOffsetSeconds(preferTranscode ? effectiveResumeAt : 0);
        transcodeStartOffsetRef.current = preferTranscode ? effectiveResumeAt : 0;
        pendingTranscodeSeekDisplayRef.current =
          preferTranscode && effectiveResumeAt > 0 ? { target: effectiveResumeAt, at: Date.now() } : null;
        pendingResumeTargetRef.current = effectiveResumeAt;
        userPausedRef.current = false;
        autoResumeWhenPlayableRef.current = autoplay;
        setAbsoluteCurrentSeconds(effectiveResumeAt);
        setPlaybackLoading(true);
        setPlayerStatus("buffering");
        activeStreamConfigKeyRef.current = player.buildPlaybackStreamConfigKeyWithStart({
          fileIndex: selected.index,
          preferTranscode,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds,
          startSeconds: preferTranscode ? effectiveResumeAt : 0
        });
        applyStreamUrl(nextUrl, {
          autoplay,
          resumeAt: preferTranscode ? 0 : effectiveResumeAt
        });

        logInfo("stream", "playback file switched", {
          source,
          selectedFileIndex: selected.index,
          preferTranscode,
          resumeAt: effectiveResumeAt,
          requestedResumeAt: resumeAt
        });
      } catch (error) {
        const message = player.toErrorMessage(error, t("media.player.playbackError"));
        notifications.show({ color: "red", message });
        setPlayerError(message);
        setPlayerStatus("error");
        logError("stream", "failed to switch playback file", { message, source, nextIndex });
      } finally {
        fileSwitchingRef.current = false;
        setFileSwitching(false);
      }
    },
    [
      activeStreamConfigKeyRef,
      applyFileOptions,
      applyStreamUrl,
      autoResumeWhenPlayableRef,
      buildHLSPlaylistOptions,
      detail?.runtimeSeconds,
      fileSwitchingRef,
      infoHash,
      logError,
      logInfo,
      pendingResumeTargetRef,
      pendingTranscodeSeekDisplayRef,
      resetAudioTracks,
      resolvePlayableTranscodeStartForFile,
      selectedAudioTrackQueryIndexRef,
      selectedFileIndexRef,
      setAbsoluteCurrentSeconds,
      setFileSwitching,
      setPlaybackLoading,
      setPlayerError,
      setPlayerStatus,
      setSelectedFileIndex,
      setSelectedSubtitleId,
      setStatusSnapshot,
      setTranscodeStartOffsetSeconds,
      setVideoDuration,
      statusSnapshotRef,
      t,
      totalDurationSecondsRef,
      trackPreferencesHydratedKeyRef,
      transcodeOutputResolution,
      transcodePrebufferSeconds,
      transcodeStartOffsetRef,
      userId,
      userPausedRef
    ]
  );
}

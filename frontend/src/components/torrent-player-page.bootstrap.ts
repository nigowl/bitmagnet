"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionStreamURL,
  fetchPlayerTransmissionBootstrap,
  fetchPlayerTransmissionStatus,
  selectPlayerTransmissionFile,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";
import { useTorrentPlayerFileSelect } from "./torrent-player-page.file-select";

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

type UseTorrentPlayerBootstrapArgs = {
  t: TFunction;
  infoHash: string;
  userId?: number;
  detail: TorrentDetailLite | null;
  applyFileOptions: (nextOptions: PlaybackFileOption[]) => void;
  applyStreamUrl: ApplyStreamUrl;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  resolvePreferTranscode: (file?: PlaybackFileOption | null, status?: PlayerTransmissionStatusResponse | null) => boolean;
  resetAudioTracks: () => void;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setBootstrapLoading: Dispatch<SetStateAction<boolean>>;
  setBootstrapped: Dispatch<SetStateAction<boolean>>;
  setFileSwitching: Dispatch<SetStateAction<boolean>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setSelectedFileIndex: Dispatch<SetStateAction<number>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
  setStatusSnapshot: Dispatch<SetStateAction<PlayerTransmissionStatusResponse | null>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
  setVideoDuration: Dispatch<SetStateAction<number>>;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  bootstrapRunTokenRef: MutableRefObject<number>;
  fileSwitchingRef: MutableRefObject<boolean>;
  pendingRequestedFileIndexRef: MutableRefObject<number | null>;
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
};

export function useTorrentPlayerBootstrap({
  t,
  infoHash,
  userId,
  detail,
  applyFileOptions,
  applyStreamUrl,
  buildHLSPlaylistOptions,
  resolvePlayableTranscodeStartForFile,
  resolvePreferTranscode,
  resetAudioTracks,
  setAbsoluteCurrentSeconds,
  setBootstrapLoading,
  setBootstrapped,
  setFileSwitching,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus,
  setSelectedFileIndex,
  setSelectedSubtitleId,
  setStatusSnapshot,
  setTranscodeStartOffsetSeconds,
  setVideoDuration,
  activeStreamConfigKeyRef,
  autoResumeWhenPlayableRef,
  bootstrapRunTokenRef,
  fileSwitchingRef,
  pendingRequestedFileIndexRef,
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
  logInfo
}: UseTorrentPlayerBootstrapArgs) {
  const bootstrapPlayer = useCallback(async () => {
    if (!infoHash) {
      bootstrapRunTokenRef.current += 1;
      setBootstrapped(false);
      setBootstrapLoading(false);
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }

    const runToken = bootstrapRunTokenRef.current + 1;
    bootstrapRunTokenRef.current = runToken;
    setBootstrapLoading(true);
    setPlayerStatus("initializing");
    setPlayerError(null);
    setBootstrapped(false);

    try {
      const deadline = Date.now() + player.BOOTSTRAP_MAX_WAIT_MS;
      let attempts = 0;

      while (bootstrapRunTokenRef.current === runToken) {
        let result: Awaited<ReturnType<typeof fetchPlayerTransmissionBootstrap>>;
        try {
          result = await fetchPlayerTransmissionBootstrap(infoHash);
        } catch (error) {
          const message = player.toErrorMessage(error, "");
          const normalized = message.toLowerCase();
          const metadataPending =
            normalized.includes("playable file not found") ||
            normalized.includes("player file not found");
          if (!metadataPending) {
            throw error;
          }

          attempts += 1;
          setPlayerStatus("initializing");
          setPlayerError(null);

          try {
            const pendingStatus = await fetchPlayerTransmissionStatus(infoHash);
            if (bootstrapRunTokenRef.current !== runToken) return;
            setStatusSnapshot(pendingStatus);
          } catch {
            // ignore status polling failures during bootstrap wait
          }

          if (attempts === 1 || attempts % 4 === 0) {
            logInfo("bootstrap", "waiting for metadata from peers", { attempt: attempts });
          }
          if (Date.now() >= deadline) {
            throw new Error(t("media.player.connectionTimeout"));
          }
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, player.BOOTSTRAP_RETRY_MS);
          });
          continue;
        }
        if (bootstrapRunTokenRef.current !== runToken) return;

        const rawFiles = result.status.files || [];
        const options = player.buildPlaybackFileOptions(rawFiles);
        if (options.length === 0) {
          if (rawFiles.length > 0) {
            throw new Error(t("media.player.noVideoFiles"));
          }
          setStatusSnapshot(result.status);
          setPlayerStatus("initializing");
          setPlayerError(null);

          attempts += 1;
          if (attempts === 1 || attempts % 4 === 0) {
            logInfo("bootstrap", "waiting for file list from transmission", {
              attempt: attempts,
              peers: result.status.peersConnected,
              progress: result.status.progress
            });
          }

          if (Date.now() >= deadline) {
            throw new Error(t("media.player.connectionTimeout"));
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, player.BOOTSTRAP_RETRY_MS);
          });
          continue;
        }

        let activeResult: { selectedFileIndex: number; status: PlayerTransmissionStatusResponse } = result;
        let activeOptions = options;
        const requestedIndex =
          Number.isInteger(pendingRequestedFileIndexRef.current) && (pendingRequestedFileIndexRef.current ?? -1) >= 0
            ? Number(pendingRequestedFileIndexRef.current)
            : -1;
        const rememberedIndex = player.readRememberedPlaybackFileIndex(infoHash, userId);
        const preferredIndex = [requestedIndex, rememberedIndex, activeResult.selectedFileIndex]
          .find((index) => Number.isInteger(index) && activeOptions.some((item) => item.index === index)) ?? -1;

        if (preferredIndex >= 0 && preferredIndex !== activeResult.selectedFileIndex) {
          activeResult = await selectPlayerTransmissionFile(infoHash, preferredIndex);
          if (bootstrapRunTokenRef.current !== runToken) return;
          activeOptions = player.buildPlaybackFileOptions(activeResult.status.files || []);
          if (activeOptions.length === 0) throw new Error(t("media.player.noVideoFiles"));
        }

        setStatusSnapshot(activeResult.status);
        applyFileOptions(activeOptions);

        const selected =
          activeOptions.find((item) => item.index === preferredIndex) ||
          activeOptions.find((item) => item.index === activeResult.selectedFileIndex) ||
          activeOptions[0]!;
        setSelectedFileIndex(selected.index);
        selectedFileIndexRef.current = selected.index;
        statusSnapshotRef.current = activeResult.status;
        player.writeRememberedPlaybackFileIndex(infoHash, userId, selected.index);
        if (requestedIndex === selected.index) {
          pendingRequestedFileIndexRef.current = null;
        }

        const preferTranscode = resolvePreferTranscode(selected, activeResult.status);
        const mode = preferTranscode ? "transcode" : "direct";
        const startupDurationSeconds = Math.max(
          0,
          activeResult.status.selectedFileDurationSeconds || 0,
          totalDurationSecondsRef.current,
          detail?.runtimeSeconds || 0
        );
        const playableStart = preferTranscode
          ? resolvePlayableTranscodeStartForFile(
            0,
            startupDurationSeconds,
            selected,
            activeResult.status,
            "bootstrap"
          )
          : null;
        const effectiveStartSeconds = playableStart?.seconds ?? 0;
        const startBytes = playableStart?.startBytes ?? 0;
        const nextUrl = preferTranscode
          ? buildPlayerTransmissionHLSPlaylistURL(
            infoHash,
            selected.index,
            `${selected.index}-${mode}-hls-${Math.floor(effectiveStartSeconds * 10)}`,
            buildHLSPlaylistOptions({
              startSeconds: effectiveStartSeconds,
              startBytes,
              prebufferSeconds: playableStart?.prebufferSeconds,
              durationSeconds: startupDurationSeconds
            })
          )
          : buildPlayerTransmissionStreamURL(infoHash, selected.index, `${selected.index}-${mode}-direct`);
        setTranscodeStartOffsetSeconds(preferTranscode ? effectiveStartSeconds : 0);
        transcodeStartOffsetRef.current = preferTranscode ? effectiveStartSeconds : 0;
        pendingTranscodeSeekDisplayRef.current =
          preferTranscode && effectiveStartSeconds > 0 ? { target: effectiveStartSeconds, at: Date.now() } : null;
        pendingResumeTargetRef.current = preferTranscode ? effectiveStartSeconds : 0;
        setAbsoluteCurrentSeconds(preferTranscode ? effectiveStartSeconds : 0);
        activeStreamConfigKeyRef.current = player.buildPlaybackStreamConfigKeyWithStart({
          fileIndex: selected.index,
          preferTranscode,
          audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
          outputResolution: transcodeOutputResolution,
          prebufferSeconds: transcodePrebufferSeconds,
          startSeconds: preferTranscode ? effectiveStartSeconds : 0
        });
        applyStreamUrl(nextUrl, { autoplay: false });

        setBootstrapped(true);
        setPlayerStatus("ready");
        logInfo("bootstrap", "player bootstrap complete", {
          selectedFileIndex: selected.index,
          files: activeOptions.length,
          mode,
          preferTranscode
        });
        return;
      }
    } catch (error) {
      if (bootstrapRunTokenRef.current !== runToken) return;
      const rawMessage = player.toErrorMessage(error, t("media.player.loadFailed"));
      const message = player.normalizePlayerErrorMessage(rawMessage, t);
      setPlayerStatus("error");
      setPlayerError(message);
      logError("bootstrap", "bootstrap failed", { message });
    } finally {
      if (bootstrapRunTokenRef.current === runToken) {
        setBootstrapLoading(false);
      }
    }
  }, [
    activeStreamConfigKeyRef,
    applyFileOptions,
    applyStreamUrl,
    bootstrapRunTokenRef,
    buildHLSPlaylistOptions,
    detail?.runtimeSeconds,
    infoHash,
    logError,
    logInfo,
    pendingRequestedFileIndexRef,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    resolvePlayableTranscodeStartForFile,
    resolvePreferTranscode,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndexRef,
    setAbsoluteCurrentSeconds,
    setBootstrapLoading,
    setBootstrapped,
    setPlayerError,
    setPlayerStatus,
    setSelectedFileIndex,
    setStatusSnapshot,
    setTranscodeStartOffsetSeconds,
    statusSnapshotRef,
    t,
    totalDurationSecondsRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    transcodeStartOffsetRef,
    userId
  ]);

  const handleSelectFile = useTorrentPlayerFileSelect({
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
  });

  return {
    bootstrapPlayer,
    handleSelectFile
  };
}

"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildPlayerTransmissionHLSPlaylistURL,
  buildPlayerTransmissionStreamURL,
  type PlayerTransmissionStatusResponse
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
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

type UseTorrentPlayerLifecycleArgs = {
  t: (key: string) => string;
  infoHash: string;
  bootstrapped: boolean;
  activePreferTranscode: boolean;
  fileOptions: PlaybackFileOption[];
  selectedFileIndex: number;
  requestedFileIndex: number;
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  totalDurationSeconds: number;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  applyStreamUrl: ApplyStreamUrl;
  bootstrapPlayer: () => Promise<void>;
  buildHLSPlaylistOptions: BuildHLSPlaylistOptions;
  handleSelectFile: (nextIndex: number, source: "panel" | "native", options?: { resumeAt?: number; autoplay?: boolean }) => Promise<void>;
  loadServerAudioTracks: (fileIndex: number) => Promise<void>;
  loadSubtitles: () => Promise<void>;
  loadTorrentDetail: () => Promise<void>;
  resolveAbsoluteCurrent: () => number;
  resolvePlayableTranscodeStartForFile: ResolvePlayableStart;
  shouldAutoplayStreamChange: () => boolean;
  activeStreamConfigKeyRef: MutableRefObject<string>;
  autoResumeWhenPlayableRef: MutableRefObject<boolean>;
  initializedInfoHashRef: MutableRefObject<string>;
  pendingRequestedFileIndexRef: MutableRefObject<number | null>;
  pendingResumeTargetRef: MutableRefObject<number | null>;
  pendingTranscodeSeekDisplayRef: MutableRefObject<{ target: number; at: number } | null>;
  selectedAudioTrackQueryIndexRef: MutableRefObject<number>;
  selectedFileIndexRef: MutableRefObject<number>;
  seekingSwitchingRef: MutableRefObject<boolean>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  totalDurationSecondsRef: MutableRefObject<number>;
  transcodeStartOffsetRef: MutableRefObject<number>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  logInfo: LogFn;
  setAbsoluteCurrentSeconds: Dispatch<SetStateAction<number>>;
  setPlaybackLoading: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setPlayerStatus: Dispatch<SetStateAction<PlayerStatus>>;
  setTranscodeStartOffsetSeconds: Dispatch<SetStateAction<number>>;
};

export function useTorrentPlayerLifecycle({
  t,
  infoHash,
  bootstrapped,
  activePreferTranscode,
  fileOptions,
  selectedFileIndex,
  requestedFileIndex,
  statusSnapshot,
  totalDurationSeconds,
  transcodeOutputResolution,
  transcodePrebufferSeconds,
  applyStreamUrl,
  bootstrapPlayer,
  buildHLSPlaylistOptions,
  handleSelectFile,
  loadServerAudioTracks,
  loadSubtitles,
  loadTorrentDetail,
  resolveAbsoluteCurrent,
  resolvePlayableTranscodeStartForFile,
  shouldAutoplayStreamChange,
  activeStreamConfigKeyRef,
  autoResumeWhenPlayableRef,
  initializedInfoHashRef,
  pendingRequestedFileIndexRef,
  pendingResumeTargetRef,
  pendingTranscodeSeekDisplayRef,
  selectedAudioTrackQueryIndexRef,
  selectedFileIndexRef,
  seekingSwitchingRef,
  statusSnapshotRef,
  totalDurationSecondsRef,
  transcodeStartOffsetRef,
  videoRef,
  logInfo,
  setAbsoluteCurrentSeconds,
  setPlaybackLoading,
  setPlayerError,
  setPlayerStatus,
  setTranscodeStartOffsetSeconds
}: UseTorrentPlayerLifecycleArgs) {
  useEffect(() => {
    if (!infoHash) {
      initializedInfoHashRef.current = "";
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }
    if (initializedInfoHashRef.current === infoHash) {
      return;
    }
    initializedInfoHashRef.current = infoHash;
    void loadTorrentDetail();
    void bootstrapPlayer();
    void loadSubtitles();
  }, [bootstrapPlayer, infoHash, initializedInfoHashRef, loadSubtitles, loadTorrentDetail, setPlayerError, t]);

  useEffect(() => {
    if (!bootstrapped) return;
    const target = pendingRequestedFileIndexRef.current;
    if (!Number.isInteger(target) || (target || -1) < 0) return;
    const targetIndex = Number(target);
    pendingRequestedFileIndexRef.current = null;
    if (selectedFileIndexRef.current === targetIndex) return;
    if (!fileOptions.some((item) => item.index === targetIndex)) return;
    void handleSelectFile(targetIndex, "panel");
  }, [bootstrapped, fileOptions, handleSelectFile, pendingRequestedFileIndexRef, requestedFileIndex, selectedFileIndexRef]);

  useEffect(() => {
    if (!bootstrapped || selectedFileIndex < 0) return;
    void loadServerAudioTracks(selectedFileIndex);
  }, [bootstrapped, loadServerAudioTracks, selectedFileIndex]);

  useEffect(() => {
    if (!bootstrapped || !infoHash || selectedFileIndex < 0 || fileOptions.length === 0) return;
    if (seekingSwitchingRef.current) return;
    const selected = fileOptions.find((item) => item.index === selectedFileIndex);
    if (!selected) return;

    const preferTranscode = activePreferTranscode;
    const mode = preferTranscode ? "transcode" : "direct";
    const resumeAt = Math.max(0, resolveAbsoluteCurrent());
    const playableStart = preferTranscode
      ? resolvePlayableTranscodeStartForFile(
        resumeAt,
        totalDurationSecondsRef.current,
        selected,
        statusSnapshotRef.current,
        "stream_config"
      )
      : null;
    const effectiveResumeAt = playableStart?.seconds ?? resumeAt;
    const startBytes = playableStart?.startBytes ?? 0;
    const baseConfigKey = player.buildPlaybackStreamConfigKey({
      fileIndex: selectedFileIndex,
      preferTranscode,
      audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
      outputResolution: transcodeOutputResolution,
      prebufferSeconds: transcodePrebufferSeconds
    });
    const video = videoRef.current;
    const canRetargetIdleStart = Boolean(
      preferTranscode &&
      playableStart?.adjusted &&
      resumeAt < 1 &&
      (!video || video.paused) &&
      !autoResumeWhenPlayableRef.current
    );
    const nextConfigKey = canRetargetIdleStart
      ? player.buildPlaybackStreamConfigKeyWithStart({
        fileIndex: selectedFileIndex,
        preferTranscode,
        audioTrackIndex: selectedAudioTrackQueryIndexRef.current,
        outputResolution: transcodeOutputResolution,
        prebufferSeconds: transcodePrebufferSeconds,
        startSeconds: effectiveResumeAt
      })
      : baseConfigKey;
    const nextUrl = preferTranscode
      ? buildPlayerTransmissionHLSPlaylistURL(
        infoHash,
        selectedFileIndex,
        `${selectedFileIndex}-${mode}-hls-${Math.floor(effectiveResumeAt * 10)}-${transcodePrebufferSeconds}`,
        buildHLSPlaylistOptions({
          startSeconds: effectiveResumeAt,
          startBytes,
          prebufferSeconds: playableStart?.prebufferSeconds,
          durationSeconds: totalDurationSecondsRef.current
        })
      )
      : buildPlayerTransmissionStreamURL(infoHash, selectedFileIndex, `${selectedFileIndex}-${mode}-direct`);
    const currentConfigKey = activeStreamConfigKeyRef.current;
    const currentMatchesBaseConfig = currentConfigKey === baseConfigKey || currentConfigKey.startsWith(`${baseConfigKey}:`);
    if (currentConfigKey === nextConfigKey) {
      return;
    }
    if (!canRetargetIdleStart && currentMatchesBaseConfig) {
      return;
    }

    setTranscodeStartOffsetSeconds(preferTranscode ? effectiveResumeAt : 0);
    transcodeStartOffsetRef.current = preferTranscode ? effectiveResumeAt : 0;
    pendingTranscodeSeekDisplayRef.current = preferTranscode ? { target: effectiveResumeAt, at: Date.now() } : null;
    pendingResumeTargetRef.current = effectiveResumeAt;
    if (preferTranscode) {
      setAbsoluteCurrentSeconds(effectiveResumeAt);
    }
    const shouldAutoplay = shouldAutoplayStreamChange();
    autoResumeWhenPlayableRef.current = shouldAutoplay;
    setPlaybackLoading(shouldAutoplay);
    setPlayerStatus(shouldAutoplay ? "buffering" : "ready");
    activeStreamConfigKeyRef.current = nextConfigKey;
    applyStreamUrl(nextUrl, {
      autoplay: shouldAutoplay,
      resumeAt: preferTranscode ? 0 : effectiveResumeAt
    });

    logInfo("stream", "stream mode updated", {
      mode,
      selectedFileIndex,
      preferTranscode,
      resumeAt: effectiveResumeAt,
      requestedResumeAt: resumeAt
    });
  }, [
    applyStreamUrl,
    activePreferTranscode,
    activeStreamConfigKeyRef,
    autoResumeWhenPlayableRef,
    buildHLSPlaylistOptions,
    bootstrapped,
    fileOptions,
    infoHash,
    logInfo,
    pendingResumeTargetRef,
    pendingTranscodeSeekDisplayRef,
    resolveAbsoluteCurrent,
    resolvePlayableTranscodeStartForFile,
    selectedAudioTrackQueryIndexRef,
    selectedFileIndex,
    setAbsoluteCurrentSeconds,
    setPlaybackLoading,
    setPlayerStatus,
    setTranscodeStartOffsetSeconds,
    seekingSwitchingRef,
    shouldAutoplayStreamChange,
    statusSnapshot,
    statusSnapshotRef,
    totalDurationSeconds,
    totalDurationSecondsRef,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    transcodeStartOffsetRef,
    videoRef
  ]);
}

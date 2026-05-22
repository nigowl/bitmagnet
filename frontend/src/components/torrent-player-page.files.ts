"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { fetchPlayerTransmissionStatus, type PlayerTransmissionStatusResponse } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type PlaybackFileOption = player.PlaybackFileOption;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerFilesArgs = {
  infoHash: string;
  requestedFileIndex: number;
  bootstrapped: boolean;
  fileSwitchingRef: MutableRefObject<boolean>;
  selectedFileIndexRef: MutableRefObject<number>;
  statusSnapshotRef: MutableRefObject<PlayerTransmissionStatusResponse | null>;
  logWarn: LogFn;
};

export function useTorrentPlayerFiles({
  infoHash,
  requestedFileIndex,
  bootstrapped,
  fileSwitchingRef,
  selectedFileIndexRef,
  statusSnapshotRef,
  logWarn
}: UseTorrentPlayerFilesArgs) {
  const pollTimerRef = useRef<number | null>(null);
  const statusPollInFlightRef = useRef(false);
  const pendingRequestedFileIndexRef = useRef<number | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<PlayerTransmissionStatusResponse | null>(null);
  const [fileOptions, setFileOptions] = useState<PlaybackFileOption[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);

  const applyFileOptions = useCallback((nextOptions: PlaybackFileOption[]) => {
    setFileOptions((current) => {
      const currentSignature = current.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      const nextSignature = nextOptions.map((item) => `${item.index}:${item.length}:${item.name}`).join("|");
      return currentSignature === nextSignature ? current : nextOptions;
    });
  }, []);

  useEffect(() => {
    selectedFileIndexRef.current = selectedFileIndex;
  }, [selectedFileIndex, selectedFileIndexRef]);

  useEffect(() => {
    statusSnapshotRef.current = statusSnapshot;
  }, [statusSnapshot, statusSnapshotRef]);

  useEffect(() => {
    pendingRequestedFileIndexRef.current = requestedFileIndex >= 0 ? requestedFileIndex : null;
  }, [infoHash, requestedFileIndex]);

  useEffect(() => {
    if (!bootstrapped || !infoHash) return;
    let cancelled = false;

    const runPoll = async () => {
      if (cancelled || document.hidden || fileSwitchingRef.current || statusPollInFlightRef.current) {
        return;
      }
      statusPollInFlightRef.current = true;
      try {
        const next = await fetchPlayerTransmissionStatus(infoHash);
        if (cancelled || fileSwitchingRef.current) return;
        setStatusSnapshot(next);
        statusSnapshotRef.current = next;
        const options = player.buildPlaybackFileOptions(next.files || []);
        if (options.length > 0) {
          applyFileOptions(options);
        }
        if (Number.isInteger(next.selectedFileIndex) && next.selectedFileIndex >= 0) {
          setSelectedFileIndex(next.selectedFileIndex);
          selectedFileIndexRef.current = next.selectedFileIndex;
        }
      } catch (error) {
        if (cancelled) return;
        logWarn("status", "poll status failed", { message: player.toErrorMessage(error, "poll failed") });
      } finally {
        statusPollInFlightRef.current = false;
      }
    };

    void runPoll();
    pollTimerRef.current = window.setInterval(() => {
      void runPoll();
    }, player.STATUS_POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [
    applyFileOptions,
    bootstrapped,
    fileSwitchingRef,
    infoHash,
    logWarn,
    selectedFileIndexRef,
    statusSnapshotRef
  ]);

  return {
    statusSnapshot,
    setStatusSnapshot,
    statusSnapshotRef,
    fileOptions,
    applyFileOptions,
    selectedFileIndex,
    setSelectedFileIndex,
    pendingRequestedFileIndexRef
  };
}

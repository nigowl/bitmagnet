"use client";

import { useCallback, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from "react";

type UseTorrentPlayerPanelHandlersArgs = {
  handleSelectFile: (nextIndex: number, source: "panel" | "native", options?: { resumeAt?: number; autoplay?: boolean }) => Promise<void>;
  setDiagnosticsOpened: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerOpened: Dispatch<SetStateAction<boolean>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
  setVideoFitMode: Dispatch<SetStateAction<"contain" | "cover" | "fill">>;
};

export function useTorrentPlayerPanelHandlers({
  handleSelectFile,
  setDiagnosticsOpened,
  setSettingsOpen,
  setSubtitleManagerOpened,
  setSelectedSubtitleId,
  setVideoFitMode
}: UseTorrentPlayerPanelHandlersArgs) {
  const handleSettingsButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSettingsOpen((value) => !value);
  }, [setSettingsOpen]);

  const handleCycleVideoFitMode = useCallback(() => {
    setVideoFitMode((current) => {
      if (current === "contain") return "cover";
      if (current === "cover") return "fill";
      return "contain";
    });
  }, [setVideoFitMode]);

  const handleOpenDiagnostics = useCallback(() => {
    setDiagnosticsOpened(true);
  }, [setDiagnosticsOpened]);

  const handleOpenSubtitleManager = useCallback(() => {
    setSettingsOpen(false);
    setSubtitleManagerOpened(true);
  }, [setSettingsOpen, setSubtitleManagerOpened]);

  const handleSetSelectedSubtitleId = useCallback((value: string) => {
    setSelectedSubtitleId(value);
  }, [setSelectedSubtitleId]);

  const handleSelectFilePanel = useCallback((nextIndex: number) => {
    void handleSelectFile(nextIndex, "panel");
  }, [handleSelectFile]);

  return {
    handleCycleVideoFitMode,
    handleOpenDiagnostics,
    handleOpenSubtitleManager,
    handleSelectFilePanel,
    handleSetSelectedSubtitleId,
    handleSettingsButtonClick
  };
}

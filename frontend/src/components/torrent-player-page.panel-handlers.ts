"use client";

import { useCallback, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from "react";

type UseTorrentPlayerPanelHandlersArgs = {
  handleSelectFile: (nextIndex: number, source: "panel" | "native", options?: { resumeAt?: number; autoplay?: boolean }) => Promise<void>;
  setDiagnosticsOpened: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setVideoImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerOpened: Dispatch<SetStateAction<boolean>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
};

export function useTorrentPlayerPanelHandlers({
  handleSelectFile,
  setDiagnosticsOpened,
  setSettingsOpen,
  setVideoImageSettingsOpen,
  setSubtitleManagerOpened,
  setSelectedSubtitleId
}: UseTorrentPlayerPanelHandlersArgs) {
  const handleSettingsButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setVideoImageSettingsOpen(false);
    setSettingsOpen((value) => !value);
  }, [setSettingsOpen, setVideoImageSettingsOpen]);

  const handleImageSettingsButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSettingsOpen(false);
    setVideoImageSettingsOpen((value) => !value);
  }, [setSettingsOpen, setVideoImageSettingsOpen]);

  const handleOpenDiagnostics = useCallback(() => {
    setDiagnosticsOpened(true);
  }, [setDiagnosticsOpened]);

  const handleOpenSubtitleManager = useCallback(() => {
    setSettingsOpen(false);
    setVideoImageSettingsOpen(false);
    setSubtitleManagerOpened(true);
  }, [setSettingsOpen, setSubtitleManagerOpened, setVideoImageSettingsOpen]);

  const handleSetSelectedSubtitleId = useCallback((value: string) => {
    setSelectedSubtitleId(value);
  }, [setSelectedSubtitleId]);

  const handleSelectFilePanel = useCallback((nextIndex: number) => {
    void handleSelectFile(nextIndex, "panel");
  }, [handleSelectFile]);

  return {
    handleImageSettingsButtonClick,
    handleOpenDiagnostics,
    handleOpenSubtitleManager,
    handleSelectFilePanel,
    handleSetSelectedSubtitleId,
    handleSettingsButtonClick
  };
}

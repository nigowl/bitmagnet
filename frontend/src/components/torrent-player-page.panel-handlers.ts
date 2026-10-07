"use client";

import { useCallback, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from "react";

type UseTorrentPlayerPanelHandlersArgs = {
  handleSelectFile: (nextIndex: number, source: "panel" | "native", options?: { resumeAt?: number; autoplay?: boolean }) => Promise<void>;
  setDiagnosticsOpened: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setAudioTrackMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerOpened: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerTab: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string>>;
};

export function useTorrentPlayerPanelHandlers({
  handleSelectFile,
  setDiagnosticsOpened,
  setSettingsOpen,
  setAudioTrackMenuOpen,
  setSubtitleManagerOpened,
  setSubtitleManagerTab,
  setSelectedSubtitleId
}: UseTorrentPlayerPanelHandlersArgs) {
  const handleSettingsButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAudioTrackMenuOpen(false);
    setSubtitleManagerOpened(false);
    setSettingsOpen((value) => !value);
  }, [setAudioTrackMenuOpen, setSettingsOpen, setSubtitleManagerOpened]);

  const handleAudioTrackButtonClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setSettingsOpen(false);
    setSubtitleManagerOpened(false);
    setAudioTrackMenuOpen((value) => !value);
  }, [setAudioTrackMenuOpen, setSettingsOpen, setSubtitleManagerOpened]);

  const handleOpenDiagnostics = useCallback(() => {
    setDiagnosticsOpened(true);
  }, [setDiagnosticsOpened]);

  const handleOpenSubtitleManager = useCallback(() => {
    setSettingsOpen(false);
    setAudioTrackMenuOpen(false);
    setSubtitleManagerTab("files");
    setSubtitleManagerOpened((value) => !value);
  }, [setAudioTrackMenuOpen, setSettingsOpen, setSubtitleManagerOpened, setSubtitleManagerTab]);

  const handleSetSelectedSubtitleId = useCallback((value: string) => {
    setSelectedSubtitleId(value);
  }, [setSelectedSubtitleId]);

  const handleSelectFilePanel = useCallback((nextIndex: number) => {
    void handleSelectFile(nextIndex, "panel");
  }, [handleSelectFile]);

  return {
    handleAudioTrackButtonClick,
    handleOpenDiagnostics,
    handleOpenSubtitleManager,
    handleSelectFilePanel,
    handleSetSelectedSubtitleId,
    handleSettingsButtonClick
  };
}

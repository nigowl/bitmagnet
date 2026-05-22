"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { isElementFullscreen } from "@/lib/player/native-media";

type UseTorrentPlayerDomEffectsArgs = {
  streamUrl: string;
  settingsOpen: boolean;
  inlineSettingsRef: MutableRefObject<HTMLDivElement | null>;
  playerStageRef: MutableRefObject<HTMLDivElement | null>;
  stageClickTimerRef: MutableRefObject<number | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  setIsFullscreenActive: Dispatch<SetStateAction<boolean>>;
  setIsPipActive: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
};

export function useTorrentPlayerDomEffects({
  streamUrl,
  settingsOpen,
  inlineSettingsRef,
  playerStageRef,
  stageClickTimerRef,
  videoRef,
  setIsFullscreenActive,
  setIsPipActive,
  setSettingsOpen
}: UseTorrentPlayerDomEffectsArgs) {
  useEffect(() => {
    const updateFullscreenState = () => {
      const stage = playerStageRef.current;
      if (!stage) {
        setIsFullscreenActive(false);
        return;
      }
      setIsFullscreenActive(isElementFullscreen(stage, document));
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);
    };
  }, [playerStageRef, setIsFullscreenActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnter = () => setIsPipActive(true);
    const onLeave = () => setIsPipActive(false);

    video.addEventListener("enterpictureinpicture", onEnter as EventListener);
    video.addEventListener("leavepictureinpicture", onLeave as EventListener);

    const pipDocument = document as Document & { pictureInPictureElement?: Element | null };
    setIsPipActive(pipDocument.pictureInPictureElement === video);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter as EventListener);
      video.removeEventListener("leavepictureinpicture", onLeave as EventListener);
    };
  }, [streamUrl, setIsPipActive, videoRef]);

  useEffect(() => {
    if (!settingsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = inlineSettingsRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setSettingsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [inlineSettingsRef, settingsOpen, setSettingsOpen]);

  useEffect(() => {
    return () => {
      if (stageClickTimerRef.current !== null) {
        window.clearTimeout(stageClickTimerRef.current);
        stageClickTimerRef.current = null;
      }
    };
  }, [stageClickTimerRef]);
}

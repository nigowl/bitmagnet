"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { isElementFullscreen } from "@/lib/player/native-media";

type UseTorrentPlayerDomEffectsArgs = {
  streamUrl: string;
  settingsOpen: boolean;
  audioTrackMenuOpen: boolean;
  subtitleManagerOpened: boolean;
  inlineSettingsRef: MutableRefObject<HTMLDivElement | null>;
  inlineAudioTrackRef: MutableRefObject<HTMLDivElement | null>;
  inlineSubtitleRef: MutableRefObject<HTMLDivElement | null>;
  playerStageRef: MutableRefObject<HTMLDivElement | null>;
  stageClickTimerRef: MutableRefObject<number | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  setIsFullscreenActive: Dispatch<SetStateAction<boolean>>;
  setIsPipActive: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setAudioTrackMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerOpened: Dispatch<SetStateAction<boolean>>;
};

export function useTorrentPlayerDomEffects({
  streamUrl,
  settingsOpen,
  audioTrackMenuOpen,
  subtitleManagerOpened,
  inlineSettingsRef,
  inlineAudioTrackRef,
  inlineSubtitleRef,
  playerStageRef,
  stageClickTimerRef,
  videoRef,
  setIsFullscreenActive,
  setIsPipActive,
  setSettingsOpen,
  setAudioTrackMenuOpen,
  setSubtitleManagerOpened
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
    if (!audioTrackMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = inlineAudioTrackRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setAudioTrackMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAudioTrackMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [audioTrackMenuOpen, inlineAudioTrackRef, setAudioTrackMenuOpen]);

  useEffect(() => {
    if (!subtitleManagerOpened) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = inlineSubtitleRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setSubtitleManagerOpened(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSubtitleManagerOpened(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [inlineSubtitleRef, setSubtitleManagerOpened, subtitleManagerOpened]);

  useEffect(() => {
    return () => {
      if (stageClickTimerRef.current !== null) {
        window.clearTimeout(stageClickTimerRef.current);
        stageClickTimerRef.current = null;
      }
    };
  }, [stageClickTimerRef]);
}

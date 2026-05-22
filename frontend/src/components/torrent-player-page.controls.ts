"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

const INLINE_CONTROLS_HIDE_MS = player.INLINE_CONTROLS_HIDE_MS;
const INLINE_CONTROLS_FULLSCREEN_HIDE_MS = player.INLINE_CONTROLS_FULLSCREEN_HIDE_MS;

type UseTorrentPlayerInlineControlsArgs = {
  isFullscreenActive: boolean;
  shouldKeepInlineControlsVisible: boolean;
};

export function useTorrentPlayerInlineControls({
  isFullscreenActive,
  shouldKeepInlineControlsVisible
}: UseTorrentPlayerInlineControlsArgs) {
  const controlsHideTimerRef = useRef<number | null>(null);
  const [controlsActive, setControlsActive] = useState(true);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback((delayMs: number) => {
    clearControlsHideTimer();
    if (!isFullscreenActive) {
      setControlsActive(true);
      return;
    }
    if (shouldKeepInlineControlsVisible) {
      setControlsActive(true);
      return;
    }
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsActive(false);
    }, Math.max(0, delayMs));
  }, [clearControlsHideTimer, isFullscreenActive, shouldKeepInlineControlsVisible]);

  const revealInlineControls = useCallback((delayMs = INLINE_CONTROLS_HIDE_MS) => {
    setControlsActive(true);
    scheduleControlsHide(delayMs);
  }, [scheduleControlsHide]);

  const showControlsAfterEffect = useCallback(() => {
    const timer = window.setTimeout(() => {
      setControlsActive(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (shouldKeepInlineControlsVisible) {
      clearControlsHideTimer();
      return showControlsAfterEffect();
    }
    if (!isFullscreenActive) {
      return showControlsAfterEffect();
    }
    clearControlsHideTimer();
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsActive(false);
    }, INLINE_CONTROLS_FULLSCREEN_HIDE_MS);
  }, [
    clearControlsHideTimer,
    isFullscreenActive,
    shouldKeepInlineControlsVisible,
    showControlsAfterEffect
  ]);

  useEffect(() => clearControlsHideTimer, [clearControlsHideTimer]);

  return {
    controlsActive,
    revealInlineControls,
    inlineControlRevealDelayMs: isFullscreenActive ? INLINE_CONTROLS_FULLSCREEN_HIDE_MS : INLINE_CONTROLS_HIDE_MS
  };
}

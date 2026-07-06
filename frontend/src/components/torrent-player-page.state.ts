"use client";

import { useState } from "react";
import * as player from "./torrent-player/torrent-player-helpers";

type PlayerStatus = player.PlayerStatus;
type TorrentDetailLite = player.TorrentDetailLite;
type SubtitleStylePreset = player.SubtitleStylePreset;

const TRANSCODE_PREBUFFER_DEFAULT_SECONDS = player.TRANSCODE_PREBUFFER_DEFAULT_SECONDS;

export function useTorrentPlayerState() {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [fileSwitching, setFileSwitching] = useState(false);

  const [detail, setDetail] = useState<TorrentDetailLite | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [absoluteCurrentSeconds, setAbsoluteCurrentSeconds] = useState(0);
  const [videoAspectRatioCss, setVideoAspectRatioCss] = useState("16 / 9");
  const [videoAspectRatioValue, setVideoAspectRatioValue] = useState(16 / 9);
  const [videoSourceHeight, setVideoSourceHeight] = useState(0);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [videoImageSettingsOpen, setVideoImageSettingsOpen] = useState(false);
  const [videoBrightness, setVideoBrightness] = useState(100);
  const [videoContrast, setVideoContrast] = useState(100);
  const [videoSaturation, setVideoSaturation] = useState(100);
  const [videoHue, setVideoHue] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [isSeekingDrag, setIsSeekingDrag] = useState(false);
  const [seekDraftSeconds, setSeekDraftSeconds] = useState<number | null>(null);
  const [seekHoverSeconds, setSeekHoverSeconds] = useState<number | null>(null);
  const [seekHoverRatio, setSeekHoverRatio] = useState(0);
  const [seekPreviewFailedKey, setSeekPreviewFailedKey] = useState("");
  const [seekPreviewLoadedKey, setSeekPreviewLoadedKey] = useState("");
  const [videoFitMode, setVideoFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [transcodeStartOffsetSeconds, setTranscodeStartOffsetSeconds] = useState(0);
  const [transcodeOutputResolution, setTranscodeOutputResolution] = useState(0);

  const [subtitleStylePreset, setSubtitleStylePreset] = useState<SubtitleStylePreset>({
    scale: 1.15,
    textColor: "#f6f9ff",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    verticalPercent: 0
  });
  const [subtitleManagerOpened, setSubtitleManagerOpened] = useState(false);
  const [subtitleManagerTab, setSubtitleManagerTab] = useState<string | null>("files");
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [transcodePrebufferSeconds, setTranscodePrebufferSeconds] = useState(TRANSCODE_PREBUFFER_DEFAULT_SECONDS);
  const [prebufferProgressSeconds, setPrebufferProgressSeconds] = useState(0);
  const [networkCacheSeconds, setNetworkCacheSeconds] = useState(0);
  const [networkCacheLoading, setNetworkCacheLoading] = useState(false);
  const [playableCacheAheadSeconds, setPlayableCacheAheadSeconds] = useState(0);

  return {
    bootstrapLoading,
    setBootstrapLoading,
    bootstrapped,
    setBootstrapped,
    fileSwitching,
    setFileSwitching,
    detail,
    setDetail,
    playerStatus,
    setPlayerStatus,
    playerError,
    setPlayerError,
    streamUrl,
    setStreamUrl,
    videoDuration,
    setVideoDuration,
    absoluteCurrentSeconds,
    setAbsoluteCurrentSeconds,
    videoAspectRatioCss,
    setVideoAspectRatioCss,
    videoAspectRatioValue,
    setVideoAspectRatioValue,
    videoSourceHeight,
    setVideoSourceHeight,
    isVideoPaused,
    setIsVideoPaused,
    videoPlaybackRate,
    setVideoPlaybackRate,
    videoImageSettingsOpen,
    setVideoImageSettingsOpen,
    videoBrightness,
    setVideoBrightness,
    videoContrast,
    setVideoContrast,
    videoSaturation,
    setVideoSaturation,
    videoHue,
    setVideoHue,
    settingsOpen,
    setSettingsOpen,
    isPipActive,
    setIsPipActive,
    isFullscreenActive,
    setIsFullscreenActive,
    isSeekingDrag,
    setIsSeekingDrag,
    seekDraftSeconds,
    setSeekDraftSeconds,
    seekHoverSeconds,
    setSeekHoverSeconds,
    seekHoverRatio,
    setSeekHoverRatio,
    seekPreviewFailedKey,
    setSeekPreviewFailedKey,
    seekPreviewLoadedKey,
    setSeekPreviewLoadedKey,
    videoFitMode,
    setVideoFitMode,
    transcodeStartOffsetSeconds,
    setTranscodeStartOffsetSeconds,
    transcodeOutputResolution,
    setTranscodeOutputResolution,
    subtitleStylePreset,
    setSubtitleStylePreset,
    subtitleManagerOpened,
    setSubtitleManagerOpened,
    subtitleManagerTab,
    setSubtitleManagerTab,
    playbackLoading,
    setPlaybackLoading,
    transcodePrebufferSeconds,
    setTranscodePrebufferSeconds,
    prebufferProgressSeconds,
    setPrebufferProgressSeconds,
    networkCacheSeconds,
    setNetworkCacheSeconds,
    networkCacheLoading,
    setNetworkCacheLoading,
    playableCacheAheadSeconds,
    setPlayableCacheAheadSeconds
  };
}

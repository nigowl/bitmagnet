"use client";

import type { ComponentProps } from "react";
import { TorrentPlayerOverlays } from "./torrent-player-page.overlays";
import { TorrentPlayerPageView } from "./torrent-player-page.view";

type PlayerViewProps = ComponentProps<typeof TorrentPlayerPageView>;
type OverlaysProps = ComponentProps<typeof TorrentPlayerOverlays>;

type TorrentPlayerPageRenderProps = {
  base: Pick<PlayerViewProps, "t" | "detail" | "infoHash" | "playerError" | "formatClock" | "formatBytes" | "formatSpeed">;
  state: Pick<PlayerViewProps,
    | "canInitializePlayer"
    | "isVideoPaused"
    | "isFullscreenActive"
    | "inlineControlsVisible"
    | "isPipActive"
    | "isFavorited"
    | "settingsOpen"
    | "audioTrackMenuOpen"
    | "subtitleManagerOpened"
    | "activePreferTranscode"
    | "streamUrl"
    | "selectedFileIndex"
    | "selectedFileOption"
    | "fileSwitching"
    | "fileOptions"
    | "seekHoverSeconds"
    | "seekHoverRatio"
    | "seekPreviewLoadedKey"
    | "seekPreviewFailedKey"
    | "videoFitMode"
    | "audioVolume"
    | "normalizeAudioLoudness"
    | "videoEffectPresets"
    | "videoBrightness"
    | "videoContrast"
    | "videoSaturation"
    | "videoHue"
    | "videoPlaybackRate"
    | "transcodeOutputResolution"
    | "transcodePrebufferSeconds"
    | "audioTrackSelectionAvailable"
    | "audioTrackOptions"
    | "selectedAudioTrackId"
    | "statusSnapshot"
  >;
  viewModel: Pick<PlayerViewProps,
    | "transferStatusLabel"
    | "playbackPositionLabel"
    | "stageBootstrapLoading"
    | "showPlaybackBusyOverlay"
    | "networkCacheLabel"
    | "networkCachePercent"
    | "networkCacheLoading"
    | "isDownloadComplete"
    | "isDownloading"
    | "downloadedRatio"
    | "contiguousRatio"
    | "playedRatio"
    | "sourceResolutionLabel"
    | "outputResolutionLabel"
    | "audioFormatLabel"
    | "detailTagPreview"
    | "detailSourceLabel"
    | "mediaTitleDisplay"
    | "playerStageStyle"
    | "subtitleOverlayStyle"
    | "availableRanges"
  >;
  refs: Pick<PlayerViewProps, "playerStageRef" | "inlineSettingsRef" | "inlineAudioTrackRef" | "inlineSubtitleRef" | "videoRef">;
  seek: Pick<PlayerViewProps, "activeSubtitleCue" | "seekHoverThumbnail" | "seekMax" | "displayedCurrentSeconds">;
  options: Pick<PlayerViewProps, "playbackRateOptions" | "transcodeResolutionOptions">;
  handlers: Pick<PlayerViewProps,
    | "onOpenDiagnostics"
    | "onStageClickTogglePlayback"
    | "onStageDoubleClickToggleFullscreen"
    | "onTogglePlayback"
    | "onSeekHoverMove"
    | "onSeekHoverLeave"
    | "onSeekPointerDown"
    | "onSeekInput"
    | "onSeekChange"
    | "onSeekKeyUp"
    | "onStagePointerMove"
    | "onSetVideoBrightness"
    | "onSetVideoContrast"
    | "onSetVideoSaturation"
    | "onSetVideoHue"
    | "onSetVideoFitMode"
    | "onToggleVideoEffectPreset"
    | "onSettingsButtonClick"
    | "onAudioTrackButtonClick"
    | "onSetPlaybackRate"
    | "onSetTranscodeOutputResolution"
    | "onSetTranscodePrebufferSeconds"
    | "onSetAudioVolume"
    | "onSetNormalizeAudioLoudness"
    | "onSetAudioTrackId"
    | "onOpenSubtitleManager"
    | "onRetryPlayback"
    | "onTogglePip"
    | "onToggleFullscreen"
    | "onSelectFile"
    | "onSeekPreviewLoaded"
    | "onSeekPreviewFailed"
    | "onOpenCacheStatus"
    | "onToggleFavorite"
  >;
  overlays: OverlaysProps;
};

export function TorrentPlayerPageRender({
  base,
  state,
  viewModel,
  refs,
  seek,
  options,
  handlers,
  overlays
}: TorrentPlayerPageRenderProps) {
  return (
    <>
      <TorrentPlayerPageView
        {...base}
        {...state}
        {...viewModel}
        {...refs}
        {...seek}
        {...options}
        {...handlers}
        subtitlePanel={overlays}
        stageOverlayPanel={<TorrentPlayerOverlays {...overlays} scope="stage" subtitlePanelMode="hidden" />}
      />
      <TorrentPlayerOverlays {...overlays} scope="global" />
    </>
  );
}

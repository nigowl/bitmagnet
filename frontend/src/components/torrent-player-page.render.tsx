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
    | "settingsOpen"
    | "videoImageSettingsOpen"
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
    | "selectedSubtitleId"
    | "subtitleTrackOptions"
    | "statusSnapshot"
  >;
  viewModel: Pick<PlayerViewProps,
    | "playbackStatusLabel"
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
  refs: Pick<PlayerViewProps, "playerStageRef" | "inlineSettingsRef" | "inlineImageSettingsRef" | "videoRef">;
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
    | "onImageSettingsButtonClick"
    | "onSetVideoBrightness"
    | "onSetVideoContrast"
    | "onSetVideoSaturation"
    | "onSetVideoHue"
    | "onSetVideoFitMode"
    | "onSettingsButtonClick"
    | "onSetPlaybackRate"
    | "onSetTranscodeOutputResolution"
    | "onSetTranscodePrebufferSeconds"
    | "onSetAudioTrackId"
    | "onOpenSubtitleManager"
    | "onTogglePip"
    | "onToggleFullscreen"
    | "onSelectFile"
    | "onSetSelectedSubtitleId"
    | "onSeekPreviewLoaded"
    | "onSeekPreviewFailed"
    | "onOpenCacheStatus"
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
        stageOverlayPanel={<TorrentPlayerOverlays {...overlays} scope="stage" />}
      />
      <TorrentPlayerOverlays {...overlays} scope="global" />
    </>
  );
}

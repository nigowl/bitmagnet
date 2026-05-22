"use client";

import Image from "next/image";
import type { CSSProperties, MutableRefObject, ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { Alert, Badge, Card, Group, Loader, Select, Stack, Text, Tooltip, ActionIcon } from "@mantine/core";
import { AlertTriangle, Maximize2, Minimize2, Pause, PictureInPicture2, Play, Settings2 } from "lucide-react";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import type { PlaybackFileOption, SubtitleCue, TorrentDetailLite } from "./torrent-player/torrent-player-helpers";
import { TorrentPlayerInfoPanel } from "./torrent-player-page.view-info";
import { TorrentPlayerInlineSettings } from "./torrent-player-page.view-settings";

type SelectOption = { value: string; label: string };
type HoverThumbnail = { key: string; url: string } | null;

export type TorrentPlayerPageViewProps = {
  t: (key: string) => string;
  detail: TorrentDetailLite | null;
  infoHash: string;
  playbackStatusLabel: string;
  transferStatusLabel: string;
  playbackPositionLabel: string;
  playerError: string | null;
  stageBootstrapLoading: boolean;
  canInitializePlayer: boolean;
  isVideoPaused: boolean;
  isFullscreenActive: boolean;
  inlineControlsVisible: boolean;
  isPipActive: boolean;
  settingsOpen: boolean;
  activePreferTranscode: boolean;
  streamUrl: string;
  showPlaybackBusyOverlay: boolean;
  networkCacheLabel: string;
  formatClock: (seconds: number) => string;
  isDownloadComplete: boolean;
  isDownloading: boolean;
  downloadTaskProgress: number;
  downloadedRatio: number;
  playableRatio: number;
  contiguousRatio: number;
  playedRatio: number;
  selectedFileIndex: number;
  fileSwitching: boolean;
  fileOptions: PlaybackFileOption[];
  sourceResolutionLabel: string;
  outputResolutionLabel: string;
  detailPublishedLabel: string;
  detailTagPreview: string[];
  detailSourceLabel: string;
  mediaTitleDisplay: string;
  playerStageRef: MutableRefObject<HTMLDivElement | null>;
  inlineSettingsRef: MutableRefObject<HTMLDivElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  playerStageStyle: CSSProperties;
  subtitleOverlayStyle: CSSProperties;
  activeSubtitleCue: SubtitleCue | null;
  availableRanges: Array<{ start: number; end: number }>;
  seekHoverSeconds: number | null;
  seekHoverRatio: number;
  seekHoverThumbnail: HoverThumbnail;
  seekPreviewLoadedKey: string;
  seekPreviewFailedKey: string;
  seekMax: number;
  displayedCurrentSeconds: number;
  videoFitMode: "contain" | "cover" | "fill";
  videoPlaybackRate: number;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  playbackRateOptions: number[];
  transcodeResolutionOptions: Array<{ value: number; label: string }>;
  audioTrackSelectionAvailable: boolean;
  audioTrackOptions: SelectOption[];
  selectedAudioTrackId: string;
  selectedSubtitleId: string;
  subtitleTrackOptions: SelectOption[];
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  formatBytes: (bytes: number) => string;
  formatSpeed: (bytesPerSecond: number) => string;
  onOpenDiagnostics: () => void;
  onStageClickTogglePlayback: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageDoubleClickToggleFullscreen: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onTogglePlayback: () => void;
  onSeekHoverMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSeekHoverLeave: () => void;
  onSeekPointerDown: () => void;
  onSeekInput: (value: number) => void;
  onSeekChange: (value: number) => void;
  onSeekKeyUp: (value: number, key: string) => void;
  onCycleVideoFitMode: () => void;
  onSettingsButtonClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSetPlaybackRate: (rate: number) => void;
  onSetTranscodeOutputResolution: (value: number) => void;
  onSetTranscodePrebufferSeconds: (value: number) => void;
  onSetAudioTrackId: (value: string) => void;
  onOpenSubtitleManager: () => void;
  onTogglePip: () => void;
  onToggleFullscreen: () => void;
  onSelectFile: (nextIndex: number) => void;
  onSetSelectedSubtitleId: (value: string) => void;
  onSeekPreviewLoaded: (key: string) => void;
  onSeekPreviewFailed: (key: string) => void;
  stageOverlayPanel?: ReactNode;
};

export function TorrentPlayerPageView(props: TorrentPlayerPageViewProps) {
  const {
    t,
    detail,
    infoHash,
    playbackStatusLabel,
    transferStatusLabel,
    playbackPositionLabel,
    playerError,
    stageBootstrapLoading,
    canInitializePlayer,
    isVideoPaused,
    isFullscreenActive,
    inlineControlsVisible,
    isPipActive,
    settingsOpen,
    activePreferTranscode,
    streamUrl,
    showPlaybackBusyOverlay,
    networkCacheLabel,
    formatClock,
    isDownloadComplete,
    isDownloading,
    downloadTaskProgress,
    downloadedRatio,
    playableRatio,
    contiguousRatio,
    playedRatio,
    selectedFileIndex,
    fileSwitching,
    fileOptions,
    sourceResolutionLabel,
    outputResolutionLabel,
    detailPublishedLabel,
    detailTagPreview,
    detailSourceLabel,
    mediaTitleDisplay,
    playerStageRef,
    inlineSettingsRef,
    videoRef,
    playerStageStyle,
    subtitleOverlayStyle,
    activeSubtitleCue,
    availableRanges,
    seekHoverSeconds,
    seekHoverRatio,
    seekHoverThumbnail,
    seekPreviewLoadedKey,
    seekPreviewFailedKey,
    seekMax,
    displayedCurrentSeconds,
    videoFitMode,
    videoPlaybackRate,
    transcodeOutputResolution,
    transcodePrebufferSeconds,
    playbackRateOptions,
    transcodeResolutionOptions,
    audioTrackSelectionAvailable,
    audioTrackOptions,
    selectedAudioTrackId,
    selectedSubtitleId,
    subtitleTrackOptions,
    statusSnapshot,
    formatBytes,
    formatSpeed,
    onOpenDiagnostics,
    onStageClickTogglePlayback,
    onStageDoubleClickToggleFullscreen,
    onTogglePlayback,
    onSeekHoverMove,
    onSeekHoverLeave,
    onSeekPointerDown,
    onSeekInput,
    onSeekChange,
    onSeekKeyUp,
    onCycleVideoFitMode,
    onSettingsButtonClick,
    onSetPlaybackRate,
    onSetTranscodeOutputResolution,
    onSetTranscodePrebufferSeconds,
    onSetAudioTrackId,
    onOpenSubtitleManager,
    onTogglePip,
    onToggleFullscreen,
    onSelectFile,
    onSetSelectedSubtitleId,
    onSeekPreviewLoaded,
    onSeekPreviewFailed,
    stageOverlayPanel
  } = props;

  return (
    <Stack gap="md" className="torrent-player-page">
      {detail ? (
        <Group justify="space-between" align="center" wrap="wrap" gap="sm" className="torrent-player-header">
          <div className="torrent-player-header-main">
            <Group gap="xs" wrap="wrap" className="torrent-player-title-row">
              <Text size="lg" fw={700} className="torrent-player-main-title">{detail.title}</Text>
              <Badge variant="outline">{playbackStatusLabel}</Badge>
              <Badge variant="outline" color={isDownloadComplete ? "green" : isDownloading ? "yellow" : "slate"}>
                {transferStatusLabel}
              </Badge>
              <Badge variant="light">{t("media.player.playbackPosition")}: {playbackPositionLabel}</Badge>
            </Group>
          </div>
          <Tooltip label={t("media.player.diagnosticsTitle")} withArrow>
            <ActionIcon
              className="app-icon-btn torrent-player-diagnostics-btn"
              variant="default"
              size={36}
              aria-label={t("media.player.diagnosticsTitle")}
              onClick={onOpenDiagnostics}
            >
              <Settings2 size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : null}

      {!infoHash ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {t("media.player.missingInfoHash")}
        </Alert>
      ) : null}

      {playerError ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {playerError}
        </Alert>
      ) : null}

      {stageBootstrapLoading ? (
        <div className="torrent-bootstrap-overlay">
          <Card className="torrent-bootstrap-card" withBorder>
            <Stack gap="sm" align="center" py="md">
              <Loader />
              <Text fw={700}>{t("media.player.stageBootstrapTitle")}</Text>
              <Text c="dimmed" size="sm">{t("media.player.stageBootstrapHint")}</Text>
            </Stack>
          </Card>
        </div>
      ) : null}

      {canInitializePlayer ? (
        <Card className="torrent-player-shell" withBorder>
          <div
            ref={playerStageRef}
            className={`torrent-player-stage-shell${isVideoPaused ? " is-paused" : ""}${isFullscreenActive ? " is-fullscreen" : ""}${inlineControlsVisible ? " controls-visible" : ""}`}
          >
            <div className="torrent-player-wrap torrent-player-native-wrap" style={playerStageStyle}>
              <video
                ref={videoRef}
                src={!activePreferTranscode ? streamUrl || undefined : undefined}
                className="torrent-player-video torrent-native-video"
                autoPlay={false}
                playsInline
                preload="auto"
                crossOrigin="anonymous"
              />
              {activeSubtitleCue ? (
                <div className="torrent-player-subtitle-overlay" style={subtitleOverlayStyle} aria-live="off">
                  {activeSubtitleCue.text}
                </div>
              ) : null}
              <div
                className="torrent-player-click-layer"
                aria-hidden="true"
                onClick={onStageClickTogglePlayback}
                onDoubleClick={onStageDoubleClickToggleFullscreen}
              />
            </div>
            {showPlaybackBusyOverlay ? (
              <div className="torrent-player-buffering-overlay">
                <Stack gap={6} align="center">
                  <Loader size="sm" />
                  <Text fw={600} size="sm">{t("media.player.waitingPlayableTitle")}</Text>
                  <Text c="dimmed" size="xs">{t("media.player.waitingPlayableHint")}</Text>
                  {activePreferTranscode ? (
                    <Text c="dimmed" size="xs">
                      {t("media.player.networkCacheStatus")} {networkCacheLabel}
                    </Text>
                  ) : null}
                </Stack>
              </div>
            ) : null}
            {stageOverlayPanel}

            <div className="torrent-inline-controls">
              <div className="torrent-inline-controls-row">
                <button
                  type="button"
                  className="torrent-inline-play-btn"
                  aria-label={isVideoPaused ? t("media.player.play") : t("media.player.pause")}
                  onClick={onTogglePlayback}
                >
                  {isVideoPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>

                <div className="torrent-inline-time">{formatClock(displayedCurrentSeconds)}</div>

                <div
                  className="torrent-inline-seek-shell"
                  onMouseMove={onSeekHoverMove}
                  onMouseLeave={onSeekHoverLeave}
                >
                  {seekHoverSeconds !== null ? (
                    <div className="torrent-inline-seek-hover" style={{ left: `${seekHoverRatio * 100}%` }}>
                      <span className="torrent-inline-seek-preview-time">{formatClock(seekHoverSeconds ?? 0)}</span>
                      {seekHoverThumbnail && seekPreviewFailedKey !== seekHoverThumbnail.key ? (
                        <Image
                          className={`torrent-inline-seek-preview-img${seekPreviewLoadedKey === seekHoverThumbnail.key ? " is-loaded" : ""}`}
                          src={seekHoverThumbnail.url}
                          alt=""
                          width={160}
                          height={90}
                          unoptimized
                          loading="eager"
                          onLoad={() => onSeekPreviewLoaded(seekHoverThumbnail.key)}
                          onError={() => onSeekPreviewFailed(seekHoverThumbnail.key)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="torrent-inline-seek-track">
                    <div className="torrent-inline-seek-downloaded" style={{ width: `${downloadedRatio}%` }} />
                    {availableRanges.map((range, idx) => (
                      <div
                        key={`${idx}:${range.start}:${range.end}`}
                        className="torrent-inline-seek-available-segment"
                        style={{
                          left: `${range.start * 100}%`,
                          width: `${Math.max(0, (range.end - range.start) * 100)}%`
                        }}
                      />
                    ))}
                    <div className="torrent-inline-seek-contiguous" style={{ width: `${contiguousRatio}%` }} />
                    <div className="torrent-inline-seek-played" style={{ width: `${playedRatio * 100}%` }} />
                  </div>
                  <input
                    type="range"
                    className="torrent-inline-seek-input"
                    min={0}
                    max={seekMax}
                    step={0.1}
                    value={displayedCurrentSeconds}
                    onPointerDown={onSeekPointerDown}
                    onInput={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (Number.isFinite(next)) {
                        onSeekInput(next);
                      }
                    }}
                    onChange={(event) => onSeekChange(Number(event.currentTarget.value))}
                    onKeyUp={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End" || event.key === "PageUp" || event.key === "PageDown") {
                        onSeekKeyUp(Number(event.currentTarget.value), event.key);
                      }
                    }}
                  />
                </div>

                <div className="torrent-inline-time">{formatClock(seekMax)}</div>

                <div className="torrent-inline-actions">
                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${videoFitMode !== "contain" ? " is-active" : ""}`}
                    onClick={onCycleVideoFitMode}
                    title={
                      videoFitMode === "contain"
                        ? t("media.player.fitModeContain")
                        : videoFitMode === "cover"
                          ? t("media.player.fitModeCover")
                          : t("media.player.fitModeFill")
                    }
                  >
                    {videoFitMode === "contain" ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <rect x="7.5" y="8.5" width="9" height="7" rx="1.2" />
                      </svg>
                    ) : videoFitMode === "cover" ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <rect x="5.5" y="6.5" width="13" height="11" rx="1.2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
                        <path d="M8 12h8" />
                        <path d="M8 12l2-2M8 12l2 2" />
                        <path d="M16 12l-2-2M16 12l-2 2" />
                      </svg>
                    )}
                  </button>

                  <TorrentPlayerInlineSettings
                    t={t}
                    settingsOpen={settingsOpen}
                    inlineSettingsRef={inlineSettingsRef}
                    videoPlaybackRate={videoPlaybackRate}
                    transcodeOutputResolution={transcodeOutputResolution}
                    transcodePrebufferSeconds={transcodePrebufferSeconds}
                    playbackRateOptions={playbackRateOptions}
                    transcodeResolutionOptions={transcodeResolutionOptions}
                    audioTrackSelectionAvailable={audioTrackSelectionAvailable}
                    audioTrackOptions={audioTrackOptions}
                    selectedAudioTrackId={selectedAudioTrackId}
                    selectedSubtitleId={selectedSubtitleId}
                    subtitleTrackOptions={subtitleTrackOptions}
                    onSettingsButtonClick={onSettingsButtonClick}
                    onSetPlaybackRate={onSetPlaybackRate}
                    onSetTranscodeOutputResolution={onSetTranscodeOutputResolution}
                    onSetTranscodePrebufferSeconds={onSetTranscodePrebufferSeconds}
                    onSetAudioTrackId={onSetAudioTrackId}
                    onOpenSubtitleManager={onOpenSubtitleManager}
                    onSetSelectedSubtitleId={onSetSelectedSubtitleId}
                  />

                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${isPipActive ? " is-active" : ""}`}
                    onClick={onTogglePip}
                    title={t("media.player.pictureInPicture")}
                  >
                    <PictureInPicture2 size={15} />
                  </button>

                  <button
                    type="button"
                    className={`torrent-inline-icon-btn${isFullscreenActive ? " is-active" : ""}`}
                    onClick={onToggleFullscreen}
                    title={isFullscreenActive ? t("media.player.exitFullscreen") : t("media.player.fullscreen")}
                  >
                    {isFullscreenActive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="torrent-player-control-surface">
            {detail ? (
              <TorrentPlayerInfoPanel
                t={t}
                detail={detail}
                mediaTitleDisplay={mediaTitleDisplay}
                sourceResolutionLabel={sourceResolutionLabel}
                detailPublishedLabel={detailPublishedLabel}
                isDownloadComplete={isDownloadComplete}
                downloadTaskProgress={downloadTaskProgress}
                downloadedRatio={downloadedRatio}
                playableRatio={playableRatio}
                contiguousRatio={contiguousRatio}
                streamUrl={streamUrl}
                networkCacheLabel={networkCacheLabel}
                outputResolutionLabel={outputResolutionLabel}
                statusSnapshot={statusSnapshot}
                detailSourceLabel={detailSourceLabel}
                detailTagPreview={detailTagPreview}
                formatBytes={formatBytes}
                formatSpeed={formatSpeed}
              />
            ) : null}

            <div className="torrent-player-controls-grid">
              <Select
                label={t("media.player.selectedFile")}
                data={fileOptions}
                value={selectedFileIndex >= 0 ? String(selectedFileIndex) : null}
                onChange={(value) => {
                  const nextIndex = Number(value);
                  if (!Number.isInteger(nextIndex) || nextIndex < 0) return;
                  onSelectFile(nextIndex);
                }}
                disabled={fileSwitching || fileOptions.length === 0}
                searchable
              />
            </div>
          </div>
        </Card>
      ) : null}
    </Stack>
  );
}

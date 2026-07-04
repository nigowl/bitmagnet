"use client";

import type { MutableRefObject, MouseEvent as ReactMouseEvent } from "react";
import { Text } from "@mantine/core";
import { Settings2 } from "lucide-react";
import { TRANSCODE_PREBUFFER_OPTIONS } from "./torrent-player/torrent-player-helpers";

type SelectOption = { value: string; label: string };

type TorrentPlayerInlineSettingsProps = {
  t: (key: string) => string;
  settingsOpen: boolean;
  inlineSettingsRef: MutableRefObject<HTMLDivElement | null>;
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
  onSettingsButtonClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSetPlaybackRate: (rate: number) => void;
  onSetTranscodeOutputResolution: (value: number) => void;
  onSetTranscodePrebufferSeconds: (value: number) => void;
  onSetAudioTrackId: (value: string) => void;
  onOpenSubtitleManager: () => void;
  onSetSelectedSubtitleId: (value: string) => void;
};

export function TorrentPlayerInlineSettings({
  t,
  settingsOpen,
  inlineSettingsRef,
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
  onSettingsButtonClick,
  onSetPlaybackRate,
  onSetTranscodeOutputResolution,
  onSetTranscodePrebufferSeconds,
  onSetAudioTrackId,
  onOpenSubtitleManager,
  onSetSelectedSubtitleId
}: TorrentPlayerInlineSettingsProps) {
  return (
    <div className="torrent-inline-settings-wrap" ref={inlineSettingsRef}>
      <button
        type="button"
        className={`torrent-inline-icon-btn${settingsOpen ? " is-active" : ""}`}
        onClick={onSettingsButtonClick}
        title={t("common.settings")}
      >
        <Settings2 size={15} />
      </button>
      {settingsOpen ? (
        <div className="torrent-inline-settings-menu" onPointerDown={(event) => event.stopPropagation()}>
          <div className="torrent-player-panel-header torrent-inline-settings-header">
            <div className="torrent-player-panel-title">{t("common.settings")}</div>
          </div>

          <div className="torrent-player-panel-scroll torrent-inline-settings-scroll">
            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.playbackSpeedTitle")}</div>
              <div className="torrent-inline-rate-grid">
                {playbackRateOptions.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`torrent-inline-rate-btn${Math.abs(videoPlaybackRate - rate) < 0.01 ? " is-active" : ""}`}
                    onClick={() => onSetPlaybackRate(rate)}
                  >
                    {rate.toFixed(rate % 1 === 0 ? 0 : 2).replace(/\.00$/, "")}x
                  </button>
                ))}
              </div>
            </div>

            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.resolutionOutputTitle")}</div>
              <div className="torrent-inline-rate-grid">
                {transcodeResolutionOptions.map((item) => (
                  <button
                    key={`resolution:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${transcodeOutputResolution === item.value ? " is-active" : ""}`}
                    onClick={() => onSetTranscodeOutputResolution(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.prebufferTargetTitle")}</div>
              <div className="torrent-inline-rate-grid">
                {TRANSCODE_PREBUFFER_OPTIONS.map((seconds) => (
                  <button
                    key={`prebuffer:${seconds}`}
                    type="button"
                    className={`torrent-inline-rate-btn${transcodePrebufferSeconds === seconds ? " is-active" : ""}`}
                    onClick={() => onSetTranscodePrebufferSeconds(seconds)}
                  >
                    {`${seconds}s`}
                  </button>
                ))}
              </div>
            </div>

            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.audioTrackTitle")}</div>
              {audioTrackSelectionAvailable ? (
                <div className="torrent-inline-subtitle-list">
                  {audioTrackOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`torrent-inline-subtitle-btn${selectedAudioTrackId === option.value ? " is-active" : ""}`}
                      onClick={() => onSetAudioTrackId(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Text size="xs" c="dimmed">{t("media.player.audioTrackUnavailable")}</Text>
              )}
            </div>

            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title-row">
                <div className="torrent-inline-settings-title">{t("media.player.subtitleTrack")}</div>
                <button
                  type="button"
                  className="torrent-inline-title-icon-btn"
                  onClick={onOpenSubtitleManager}
                  title={t("media.player.subtitleManage")}
                >
                  <Settings2 size={13} />
                </button>
              </div>
              <div className="torrent-inline-subtitle-list">
                {subtitleTrackOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`torrent-inline-subtitle-btn${selectedSubtitleId === option.value ? " is-active" : ""}`}
                    onClick={() => onSetSelectedSubtitleId(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

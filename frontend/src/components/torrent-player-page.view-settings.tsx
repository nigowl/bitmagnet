"use client";

import type { MutableRefObject, MouseEvent as ReactMouseEvent } from "react";
import { Text } from "@mantine/core";
import { Languages, Settings2 } from "lucide-react";
import { TRANSCODE_PREBUFFER_OPTIONS } from "./torrent-player/torrent-player-helpers";
import type { VideoEffectPreset } from "./torrent-player/torrent-player-helpers";

type SelectOption = { value: string; label: string };

type TorrentPlayerInlineSettingsProps = {
  t: (key: string) => string;
  settingsOpen: boolean;
  inlineSettingsRef: MutableRefObject<HTMLDivElement | null>;
  videoPlaybackRate: number;
  videoFitMode: "contain" | "cover" | "fill";
  videoEffectPresets: VideoEffectPreset[];
  videoBrightness: number;
  videoContrast: number;
  videoSaturation: number;
  videoHue: number;
  transcodeOutputResolution: number;
  transcodePrebufferSeconds: number;
  playbackRateOptions: number[];
  transcodeResolutionOptions: Array<{ value: number; label: string }>;
  onSettingsButtonClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSetPlaybackRate: (rate: number) => void;
  onSetVideoFitMode: (value: "contain" | "cover" | "fill") => void;
  onToggleVideoEffectPreset: (value: VideoEffectPreset) => void;
  onSetVideoBrightness: (value: number) => void;
  onSetVideoContrast: (value: number) => void;
  onSetVideoSaturation: (value: number) => void;
  onSetVideoHue: (value: number) => void;
  onSetTranscodeOutputResolution: (value: number) => void;
  onSetTranscodePrebufferSeconds: (value: number) => void;
};

export function TorrentPlayerInlineSettings({
  t,
  settingsOpen,
  inlineSettingsRef,
  videoPlaybackRate,
  videoFitMode,
  videoEffectPresets,
  videoBrightness,
  videoContrast,
  videoSaturation,
  videoHue,
  transcodeOutputResolution,
  transcodePrebufferSeconds,
  playbackRateOptions,
  transcodeResolutionOptions,
  onSettingsButtonClick,
  onSetPlaybackRate,
  onSetVideoFitMode,
  onToggleVideoEffectPreset,
  onSetVideoBrightness,
  onSetVideoContrast,
  onSetVideoSaturation,
  onSetVideoHue,
  onSetTranscodeOutputResolution,
  onSetTranscodePrebufferSeconds
}: TorrentPlayerInlineSettingsProps) {
  return (
    <div className="torrent-inline-settings-wrap" ref={inlineSettingsRef}>
      <button
        type="button"
        className={`torrent-inline-icon-btn${settingsOpen ? " is-active" : ""}`}
        onClick={onSettingsButtonClick}
        title={t("common.settings")}
        aria-label={t("common.settings")}
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
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
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
              <div className="torrent-inline-settings-title">{t("media.player.prebufferTargetTitle")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
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
              <ImageSettingRange
                label={t("media.player.brightnessTitle")}
                value={videoBrightness}
                min={50}
                max={200}
                step={5}
                suffix="%"
                onChange={onSetVideoBrightness}
              />
              <ImageSettingRange
                label={t("media.player.contrastTitle")}
                value={videoContrast}
                min={50}
                max={200}
                step={5}
                suffix="%"
                onChange={onSetVideoContrast}
              />
              <ImageSettingRange
                label={t("media.player.saturationTitle")}
                value={videoSaturation}
                min={50}
                max={200}
                step={5}
                suffix="%"
                onChange={onSetVideoSaturation}
              />
              <ImageSettingRange
                label={t("media.player.hueTitle")}
                value={videoHue}
                min={-180}
                max={180}
                step={5}
                suffix="°"
                onChange={onSetVideoHue}
              />
            </div>

            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.fitModeTitle")}</div>
              <div className="torrent-inline-rate-grid">
                {([
                  { value: "contain", label: t("media.player.fitModeContainOption") },
                  { value: "cover", label: t("media.player.fitModeCoverOption") },
                  { value: "fill", label: t("media.player.fitModeFillOption") }
                ] as const).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`torrent-inline-rate-btn${videoFitMode === item.value ? " is-active" : ""}`}
                    onClick={() => onSetVideoFitMode(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.videoEffectTitle")}</div>
              <div className="torrent-inline-rate-grid">
                {([
                  { value: "vignette", label: t("media.player.videoEffectVignette") },
                  { value: "mono", label: t("media.player.videoEffectMono") },
                  { value: "crt", label: t("media.player.videoEffectCrt") }
                ] as const).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`torrent-inline-rate-btn${videoEffectPresets.includes(item.value) ? " is-active" : ""}`}
                    aria-pressed={videoEffectPresets.includes(item.value)}
                    onClick={() => onToggleVideoEffectPreset(item.value)}
                  >
                    {item.label}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

type TorrentPlayerInlineAudioMenuProps = {
  t: (key: string) => string;
  opened: boolean;
  inlineAudioTrackRef: MutableRefObject<HTMLDivElement | null>;
  audioTrackSelectionAvailable: boolean;
  audioTrackOptions: SelectOption[];
  selectedAudioTrackId: string;
  onButtonClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSetAudioTrackId: (value: string) => void;
};

export function TorrentPlayerInlineAudioMenu({
  t,
  opened,
  inlineAudioTrackRef,
  audioTrackSelectionAvailable,
  audioTrackOptions,
  selectedAudioTrackId,
  onButtonClick,
  onSetAudioTrackId
}: TorrentPlayerInlineAudioMenuProps) {
  return (
    <div className="torrent-inline-settings-wrap" ref={inlineAudioTrackRef}>
      <button
        type="button"
        className={`torrent-inline-icon-btn${opened ? " is-active" : ""}`}
        onClick={onButtonClick}
        title={t("media.player.audioTrackTitle")}
        aria-label={t("media.player.audioTrackTitle")}
      >
        <Languages size={15} />
      </button>
      {opened ? (
        <div className="torrent-inline-settings-menu torrent-inline-track-menu" onPointerDown={(event) => event.stopPropagation()}>
          <div className="torrent-player-panel-header torrent-inline-settings-header">
            <div className="torrent-player-panel-title">{t("media.player.audioTrackTitle")}</div>
          </div>
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
      ) : null}
    </div>
  );
}

function ImageSettingRange({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="torrent-inline-setting-range">
      <div className="torrent-inline-range-label-row">
        <div className="torrent-inline-settings-title">{label}</div>
        <Text className="torrent-inline-range-value" size="xs" c="dimmed">
          {value}{suffix}
        </Text>
      </div>
      <div className="torrent-inline-range-row">
        <input
          type="range"
          className="torrent-inline-range-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          aria-label={label}
        />
      </div>
    </div>
  );
}

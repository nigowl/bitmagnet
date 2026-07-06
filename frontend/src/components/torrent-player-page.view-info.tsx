"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Loader } from "@mantine/core";
import { ExternalLink, Info } from "lucide-react";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import type { PlaybackFileOption, TorrentDetailLite } from "./torrent-player/torrent-player-helpers";

type TorrentPlayerInfoPanelProps = {
  t: (key: string) => string;
  detail: TorrentDetailLite;
  mediaTitleDisplay: string;
  sourceResolutionLabel: string;
  downloadedRatio: number;
  streamUrl: string;
  networkCacheLabel: string;
  networkCachePercent: number;
  networkCacheLoading: boolean;
  outputResolutionLabel: string;
  audioFormatLabel: string;
  selectedFileOption: PlaybackFileOption | null;
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  detailSourceLabel: string;
  detailTagPreview: string[];
  formatBytes: (bytes: number) => string;
  formatSpeed: (bytesPerSecond: number) => string;
  formatClock: (seconds: number) => string;
  onOpenCacheStatus: () => void;
};

function InfoMetric({
  label,
  value,
  percent,
  loading = false,
  wide = false,
  action = null
}: {
  label: string;
  value: string;
  percent?: number;
  loading?: boolean;
  wide?: boolean;
  action?: ReactNode;
}) {
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent || 0)) : null;
  return (
    <div className={`torrent-player-info-metric${wide ? " torrent-player-info-metric-wide" : ""}`}>
      <div className="torrent-player-info-metric-row">
        <span>{label}:</span>
        <strong>
          {value}
          {loading ? <Loader size={12} type="oval" aria-label={label} /> : null}
        </strong>
        {action}
      </div>
      {safePercent !== null ? (
        <div className="torrent-player-info-meter" aria-hidden="true">
          <span style={{ width: `${safePercent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function TorrentPlayerInfoPanel({
  t,
  detail,
  mediaTitleDisplay,
  sourceResolutionLabel,
  downloadedRatio,
  streamUrl,
  networkCacheLabel,
  networkCachePercent,
  networkCacheLoading,
  outputResolutionLabel,
  audioFormatLabel,
  selectedFileOption,
  statusSnapshot,
  detailSourceLabel,
  detailTagPreview,
  formatBytes,
  formatSpeed,
  formatClock,
  onOpenCacheStatus
}: TorrentPlayerInfoPanelProps) {
  const selectedFileLength = statusSnapshot?.selectedFileLength || selectedFileOption?.length || 0;
  const selectedFileBytes = statusSnapshot?.selectedFileBytesCompleted || 0;
  const selectedFileBytesLabel = selectedFileLength > 0
    ? `${formatBytes(selectedFileBytes)} / ${formatBytes(selectedFileLength)}`
    : "-";
  const selectedFileCacheLabel = selectedFileLength > 0 ? `${selectedFileBytesLabel} · ${downloadedRatio}%` : "-";
  const videoFormatLabel = selectedFileOption?.name
    ? (/\.([a-z0-9]{2,8})$/i.exec(selectedFileOption.name)?.[1] || "").toUpperCase()
    : "";
  const runtimeLabel = detail.runtimeSeconds ? formatClock(detail.runtimeSeconds) : "";

  return (
    <div className="torrent-player-info-panel">
      <div className="torrent-player-info-grid">
        <section className="torrent-player-info-card torrent-player-info-card-featured">
          <div className="torrent-player-info-card-title">{t("media.player.mediaInfoTitle")}</div>
          {mediaTitleDisplay && detail.mediaHref ? (
            <Link className="torrent-player-info-title-link" href={detail.mediaHref} target="_blank" rel="noreferrer">
              {mediaTitleDisplay}
              <ExternalLink size={13} />
            </Link>
          ) : mediaTitleDisplay ? (
            <div className="torrent-player-info-title-text">{mediaTitleDisplay}</div>
          ) : (
            <div className="torrent-player-info-title-text">{detail.title}</div>
          )}
          <div className="torrent-player-info-metric-grid">
            {detail.contentType ? <InfoMetric label={t("media.player.contentTypeLabel")} value={detail.contentType} /> : null}
            {sourceResolutionLabel && sourceResolutionLabel !== "-" ? (
              <InfoMetric label={t("media.player.resolution")} value={sourceResolutionLabel} />
            ) : null}
            {detail.videoSource ? <InfoMetric label={t("media.player.videoSourceLabel")} value={detail.videoSource} /> : null}
            {videoFormatLabel ? <InfoMetric label={t("media.player.videoFormatLabel")} value={videoFormatLabel} /> : null}
            {audioFormatLabel ? <InfoMetric label={t("media.player.audioFormatLabel")} value={audioFormatLabel} /> : null}
            {runtimeLabel ? <InfoMetric label={t("media.player.runtimeLabel")} value={runtimeLabel} /> : null}
          </div>
        </section>

        <section className="torrent-player-info-card">
          <div className="torrent-player-info-card-title">{t("media.player.transferInfoTitle")}</div>
          <div className="torrent-player-info-metric-grid">
            <InfoMetric
              label={t("media.player.selectedFileBytesLabel")}
              value={selectedFileCacheLabel}
              percent={downloadedRatio}
              wide
              action={(
                <button
                  type="button"
                  className="torrent-player-info-metric-action"
                  onClick={onOpenCacheStatus}
                  aria-label={t("media.detail.cacheStatusTitle")}
                  title={t("media.detail.cacheStatusTitle")}
                >
                  <Info size={12} />
                </button>
              )}
            />
            {streamUrl ? (
              <InfoMetric
                label={t("media.player.networkCacheTitle")}
                value={networkCacheLabel}
                percent={networkCachePercent}
                loading={networkCacheLoading}
              />
            ) : null}
            <InfoMetric label={t("media.player.resolutionOutputTitle")} value={outputResolutionLabel} />
            <InfoMetric label={t("media.player.downloadSpeed")} value={formatSpeed(statusSnapshot?.downloadRate || 0)} />
            <InfoMetric label={t("media.player.uploadSpeed")} value={formatSpeed(statusSnapshot?.uploadRate || 0)} />
            <InfoMetric label={t("media.player.taskStateLabel")} value={statusSnapshot?.state || "-"} />
            <InfoMetric
              label={t("media.player.sequentialDownloadLabel")}
              value={statusSnapshot?.sequentialDownload ? t("media.player.sequentialDownloadOn") : t("media.player.sequentialDownloadOff")}
            />
          </div>
        </section>

        <section className="torrent-player-info-card">
          <div className="torrent-player-info-card-title">{t("media.player.torrentInfoTitle")}</div>
          {detail.magnetUri ? (
            <a className="torrent-player-hash-link" href={detail.magnetUri} target="_blank" rel="noreferrer">
              <span>{t("media.player.infoHashLabel")}</span>
              <strong>{detail.infoHash}</strong>
              <ExternalLink size={13} />
            </a>
          ) : (
            <div className="torrent-player-hash-link torrent-player-hash-link-static">
              <span>{t("media.player.infoHashLabel")}</span>
              <strong>{detail.infoHash}</strong>
            </div>
          )}
          <div className="torrent-player-info-metric-grid">
            <InfoMetric label={t("media.player.seeders")} value={String(detail.seeders ?? 0)} />
            <InfoMetric label={t("media.player.leechers")} value={String(detail.leechers ?? 0)} />
            <InfoMetric label={t("media.player.peers")} value={String(statusSnapshot?.peersConnected || 0)} />
            {detail.sizeBytes ? <InfoMetric label={t("media.player.torrentSize")} value={formatBytes(detail.sizeBytes)} /> : null}
            {Number.isFinite(detail.filesCount) ? <InfoMetric label={t("media.player.fileCount")} value={String(detail.filesCount)} /> : null}
            {detailSourceLabel ? <InfoMetric label={t("media.player.torrentSourcesLabel")} value={detailSourceLabel} /> : null}
          </div>
          {detailTagPreview.length > 0 ? (
            <div className="torrent-player-tag-list">
              {detailTagPreview.map((tag) => <span key={`tag:${tag}`}>{tag}</span>)}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

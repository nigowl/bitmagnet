"use client";

import Link from "next/link";
import { Badge } from "@mantine/core";
import { ExternalLink } from "lucide-react";
import type { PlayerTransmissionStatusResponse } from "@/lib/media-api";
import type { TorrentDetailLite } from "./torrent-player/torrent-player-helpers";

type TorrentPlayerInfoPanelProps = {
  t: (key: string) => string;
  detail: TorrentDetailLite;
  mediaTitleDisplay: string;
  sourceResolutionLabel: string;
  detailPublishedLabel: string;
  isDownloadComplete: boolean;
  downloadTaskProgress: number;
  downloadedRatio: number;
  playableRatio: number;
  contiguousRatio: number;
  streamUrl: string;
  networkCacheLabel: string;
  outputResolutionLabel: string;
  statusSnapshot: PlayerTransmissionStatusResponse | null;
  detailSourceLabel: string;
  detailTagPreview: string[];
  formatBytes: (bytes: number) => string;
  formatSpeed: (bytesPerSecond: number) => string;
};

export function TorrentPlayerInfoPanel({
  t,
  detail,
  mediaTitleDisplay,
  sourceResolutionLabel,
  detailPublishedLabel,
  isDownloadComplete,
  downloadTaskProgress,
  downloadedRatio,
  playableRatio,
  contiguousRatio,
  streamUrl,
  networkCacheLabel,
  outputResolutionLabel,
  statusSnapshot,
  detailSourceLabel,
  detailTagPreview,
  formatBytes,
  formatSpeed
}: TorrentPlayerInfoPanelProps) {
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
          <div className="torrent-player-chip-cloud">
            {detail.contentType ? <Badge variant="light">{t("media.player.contentTypeLabel")}: {detail.contentType}</Badge> : null}
            {sourceResolutionLabel && sourceResolutionLabel !== "-" ? (
              <Badge variant="light">{t("media.player.resolution")}: {sourceResolutionLabel}</Badge>
            ) : null}
            {detail.videoSource ? <Badge variant="light">{t("media.player.videoSourceLabel")}: {detail.videoSource}</Badge> : null}
            {detailPublishedLabel ? <Badge variant="light">{t("media.player.publishedAtLabel")}: {detailPublishedLabel}</Badge> : null}
          </div>
        </section>

        <section className="torrent-player-info-card">
          <div className="torrent-player-info-card-title">{t("media.player.transferInfoTitle")}</div>
          <div className="torrent-player-chip-cloud">
            {!isDownloadComplete ? <Badge variant="outline">{t("media.player.progress")}: {downloadTaskProgress}%</Badge> : null}
            <Badge variant="outline">{t("media.player.downloadSpeed")}: {formatSpeed(statusSnapshot?.downloadRate || 0)}</Badge>
            <Badge variant="outline">{t("media.player.peers")}: {statusSnapshot?.peersConnected || 0}</Badge>
            <Badge variant="outline">{t("media.player.downloadedLabel")}: {downloadedRatio}%</Badge>
            {!isDownloadComplete ? <Badge variant="outline">{t("media.player.fileReadyLabel")}: {playableRatio}%</Badge> : null}
            {!isDownloadComplete ? <Badge variant="outline">{t("media.player.contiguousLabel")}: {contiguousRatio}%</Badge> : null}
            {streamUrl ? <Badge variant="outline">{t("media.player.networkCacheTitle")}: {networkCacheLabel}</Badge> : null}
            <Badge variant="outline">{t("media.player.resolutionOutputTitle")}: {outputResolutionLabel}</Badge>
            <Badge variant="outline">{t("media.player.sequentialDownloadLabel")}: {statusSnapshot?.sequentialDownload ? t("media.player.sequentialDownloadOn") : t("media.player.sequentialDownloadOff")}</Badge>
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
          <div className="torrent-player-chip-cloud">
            <Badge variant="light">{t("media.player.seeders")}: {detail.seeders ?? 0}</Badge>
            <Badge variant="light">{t("media.player.leechers")}: {detail.leechers ?? 0}</Badge>
            {detail.sizeBytes ? <Badge variant="light">{t("media.player.torrentSize")}: {formatBytes(detail.sizeBytes)}</Badge> : null}
            {Number.isFinite(detail.filesCount) ? <Badge variant="light">{t("media.player.fileCount")}: {detail.filesCount}</Badge> : null}
            {detailSourceLabel ? <Badge variant="light">{t("media.player.torrentSourcesLabel")}: {detailSourceLabel}</Badge> : null}
            {detailTagPreview.map((tag) => <Badge key={`tag:${tag}`} variant="outline">{tag}</Badge>)}
          </div>
        </section>
      </div>
    </div>
  );
}

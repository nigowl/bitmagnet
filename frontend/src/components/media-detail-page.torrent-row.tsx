"use client";

import Link from "next/link";
import { ActionIcon, Group, Loader, Table, Text, Tooltip } from "@mantine/core";
import { Download, ExternalLink, Eye, Play } from "lucide-react";
import type { MediaDetailTorrent, PlayerTransmissionTaskStatus } from "@/lib/media-api";
import { displayResolution, formatBytes, isTransmissionTaskComplete, resolvePlayerActionState, rowValue } from "./media-detail-page.helpers";

type TorrentRowProps = {
  item: MediaDetailTorrent;
  t: (key: string) => string;
  playerStatus?: PlayerTransmissionTaskStatus;
  playerEnabled: boolean;
  cacheQueuing?: boolean;
  onCache?: (item: MediaDetailTorrent) => void;
};

export function TorrentRow({ item, t, playerStatus, playerEnabled, cacheQueuing = false, onCache }: TorrentRowProps) {
  const torrentTitle = item.title || item.torrent.name;
  const filesCount = item.filesCount ?? item.torrent.filesCount;
  const playerStyle = resolvePlayerActionState(playerStatus);
  const cacheState = resolveCacheActionState(playerStatus, cacheQueuing, t);

  return (
    <Table.Tr>
      <Table.Td>
        <Link href={`/torrents/${item.infoHash}`} className="unstyled-link">
          <Text size="sm" lineClamp={1} title={torrentTitle}>{torrentTitle}</Text>
        </Link>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" c="green">{rowValue(item.seeders)}</Text>
          <Text size="sm" c="dimmed">/</Text>
          <Text size="sm" c="blue">{rowValue(item.leechers)}</Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{formatBytes(item.size)}</Text>
          <Text size="sm" c="dimmed">/</Text>
          <Text size="sm" c="dimmed">{rowValue(filesCount)}</Text>
        </Group>
      </Table.Td>
      <Table.Td>{displayResolution(item.videoResolution)}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          {playerEnabled ? (
            <>
              <Tooltip label={t("media.openPlayer")}>
                <ActionIcon
                  className="app-icon-btn"
                  size="sm"
                  variant={playerStyle.variant}
                  color={playerStyle.color}
                  aria-label={t("media.openPlayer")}
                  title={t("media.openPlayer")}
                  renderRoot={(props) => <Link href={`/player/${encodeURIComponent(item.infoHash)}`} {...props} />}
                >
                  <Play size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={cacheState.label}>
                <ActionIcon
                  className="app-icon-btn"
                  size="sm"
                  variant={cacheState.variant}
                  color={cacheState.color}
                  disabled={cacheState.disabled}
                  aria-label={cacheState.label}
                  title={cacheState.label}
                  onClick={() => onCache?.(item)}
                >
                  {cacheQueuing ? <Loader size={14} /> : <Download size={14} />}
                </ActionIcon>
              </Tooltip>
            </>
          ) : null}
          <Tooltip label={t("media.openTorrent")}>
            <ActionIcon
              className="app-icon-btn"
              size="sm"
              variant="default"
              color="slate"
              aria-label={t("media.openTorrent")}
              title={t("media.openTorrent")}
              renderRoot={(props) => <Link href={`/torrents/${item.infoHash}`} {...props} />}
            >
              <Eye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("media.openMagnet")}>
            <ActionIcon
              className="app-icon-btn"
              size="sm"
              variant="default"
              color="slate"
              aria-label={t("media.openMagnet")}
              title={t("media.openMagnet")}
              component="a"
              href={item.torrent.magnetUri}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function resolveCacheActionState(
  status: PlayerTransmissionTaskStatus | undefined,
  loading: boolean,
  t: (key: string) => string
): { color: string; variant: "default" | "light"; disabled: boolean; label: string } {
  if (loading) {
    return { color: "yellow", variant: "light", disabled: true, label: t("media.detail.cacheQueueing") };
  }
  if (isTransmissionTaskComplete(status)) {
    return { color: "green", variant: "light", disabled: false, label: t("media.detail.cacheDone") };
  }
  const queueState = status?.queueState?.trim().toLowerCase();
  if (queueState === "pending") {
    return { color: "yellow", variant: "light", disabled: false, label: t("media.detail.cacheRunning") };
  }
  if (queueState === "running") {
    return { color: "yellow", variant: "light", disabled: false, label: t("media.detail.cacheRunning") };
  }
  if (queueState === "canceled") {
    return { color: "gray", variant: "light", disabled: false, label: t("media.detail.cacheCanceled") };
  }
  if (queueState === "failed") {
    return { color: "red", variant: "light", disabled: false, label: t("media.detail.cacheRetry") };
  }
  return { color: "slate", variant: "default", disabled: false, label: t("media.detail.cacheTorrent") };
}

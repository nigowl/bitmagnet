"use client";

import Link from "next/link";
import { ActionIcon, Group, Table, Text, Tooltip } from "@mantine/core";
import { ExternalLink, Eye, Play } from "lucide-react";
import type { MediaDetailTorrent, PlayerTransmissionTaskStatus } from "@/lib/media-api";
import { displayResolution, formatBytes, resolvePlayerActionState, rowValue } from "./media-detail-page.helpers";

type TorrentRowProps = {
  item: MediaDetailTorrent;
  t: (key: string) => string;
  playerStatus?: PlayerTransmissionTaskStatus;
  playerEnabled: boolean;
};

export function TorrentRow({ item, t, playerStatus, playerEnabled }: TorrentRowProps) {
  const torrentTitle = item.title || item.torrent.name;
  const filesCount = item.filesCount ?? item.torrent.filesCount;
  const playerStyle = resolvePlayerActionState(playerStatus);

  return (
    <Table.Tr>
      <Table.Td>
        <Link href={`/torrents/${item.infoHash}`} className="unstyled-link">
          <Text size="sm" lineClamp={1} title={torrentTitle}>{torrentTitle}</Text>
        </Link>
      </Table.Td>
      <Table.Td>{rowValue(item.seeders)}</Table.Td>
      <Table.Td>{rowValue(item.leechers)}</Table.Td>
      <Table.Td>{formatBytes(item.size)}</Table.Td>
      <Table.Td>{rowValue(filesCount)}</Table.Td>
      <Table.Td>{displayResolution(item.videoResolution)}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          {playerEnabled ? (
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

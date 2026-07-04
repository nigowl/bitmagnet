"use client";

import { ActionIcon, Badge, Card, Checkbox, Group, Loader, Pagination, ScrollArea, Table, Text, Tooltip } from "@mantine/core";
import { Trash2 } from "lucide-react";
import type { MediaDetailResponse, MediaDetailTorrent, PlayerTransmissionTaskStatus } from "@/lib/media-api";
import { normalizeInfoHash } from "./media-detail-page.helpers";
import { TorrentRow } from "./media-detail-page.torrent-row";

type MediaDetailTorrentsSectionProps = {
  t: (key: string) => string;
  torrents: MediaDetailTorrent[];
  filteredTorrents: MediaDetailTorrent[];
  pagedTorrents: MediaDetailTorrent[];
  playerStatusMap: Record<string, PlayerTransmissionTaskStatus>;
  playerEnabled: boolean;
  torrentResolutionFilter: string;
  torrentResolutionOptions: string[];
  torrentCachedOnly: boolean;
  cachedTaskInfoHashes: string[];
  cacheClearing: boolean;
  cacheQueueing: Record<string, boolean>;
  torrentTotalPages: number;
  normalizedTorrentPage: number;
  payload: MediaDetailResponse;
  onChangeResolutionFilter: (value: string) => void;
  onChangeCachedOnly: (checked: boolean) => void;
  onClearCache: () => void;
  onCacheTorrent: (item: MediaDetailTorrent) => void;
  onChangePage: (value: number) => void;
};

export function MediaDetailTorrentsSection({
  t,
  torrents,
  filteredTorrents,
  pagedTorrents,
  playerStatusMap,
  playerEnabled,
  torrentResolutionFilter,
  torrentResolutionOptions,
  torrentCachedOnly,
  cachedTaskInfoHashes,
  cacheClearing,
  cacheQueueing,
  torrentTotalPages,
  normalizedTorrentPage,
  payload,
  onChangeResolutionFilter,
  onChangeCachedOnly,
  onClearCache,
  onCacheTorrent,
  onChangePage
}: MediaDetailTorrentsSectionProps) {
  return (
    <Card className="glass-card" withBorder>
      <Group justify="space-between" align="flex-start" mb="sm" gap="sm" wrap="wrap">
        <Group gap="xs">
          <Text fw={600}>{t("media.detail.torrentInfo")}</Text>
          <Badge variant="light">{filteredTorrents.length} / {torrents.length}</Badge>
        </Group>
        <Group gap="xs" className="media-torrent-quick-filters">
          <button
            type="button"
            className={torrentResolutionFilter === "all" ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
            onClick={() => onChangeResolutionFilter("all")}
          >
            {t("media.all")}
          </button>
          {torrentResolutionOptions.map((resolution) => {
            const value = resolution.toLowerCase();
            return (
              <button
                key={resolution}
                type="button"
                className={torrentResolutionFilter === value ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
                onClick={() => onChangeResolutionFilter(value)}
              >
                {resolution}
              </button>
            );
          })}
          <Checkbox
            size="xs"
            checked={torrentCachedOnly}
            onChange={(event) => onChangeCachedOnly(event.currentTarget.checked)}
            label={t("media.detail.cacheOnly")}
          />
          <Tooltip label={t("media.detail.clearCache")}>
            <ActionIcon
              className="app-icon-btn"
              size="sm"
              variant="default"
              color="red"
              disabled={cachedTaskInfoHashes.length === 0 || cacheClearing}
              onClick={onClearCache}
              aria-label={t("media.detail.clearCache")}
            >
              {cacheClearing ? <Loader size={14} /> : <Trash2 size={14} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {filteredTorrents.length === 0 ? (
        <Text c="dimmed">{t("media.noResults")}</Text>
      ) : (
        <>
          <ScrollArea>
            <Table className="media-torrent-snapshot-table" striped withTableBorder highlightOnHover miw={920}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("torrents.table.title")}</Table.Th>
                  <Table.Th>{t("torrents.table.seeders")} / {t("torrents.table.leechers")}</Table.Th>
                  <Table.Th>{t("torrents.table.size")} / {t("torrents.table.filesCount")}</Table.Th>
                  <Table.Th>{t("media.detail.resolution")}</Table.Th>
                  <Table.Th>{t("torrents.table.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pagedTorrents.map((torrent) => (
                  <TorrentRow
                    key={torrent.infoHash}
                    item={torrent}
                    t={t}
                    playerStatus={playerStatusMap[normalizeInfoHash(torrent.infoHash)]}
                    playerEnabled={Boolean(payload.playerEnabled && playerEnabled)}
                    cacheQueuing={Boolean(cacheQueueing[normalizeInfoHash(torrent.infoHash)])}
                    onCache={onCacheTorrent}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {torrentTotalPages > 1 ? (
            <Group justify="flex-end" mt="sm">
              <Pagination value={normalizedTorrentPage} onChange={onChangePage} total={torrentTotalPages} size="sm" />
            </Group>
          ) : null}
        </>
      )}
    </Card>
  );
}

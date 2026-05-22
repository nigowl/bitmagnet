"use client";

import { Badge, Group, Loader, Modal, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import type { PlayerTransmissionTaskStatus } from "@/lib/media-api";
import type { MediaEpisodeGroup } from "./media-detail-page.episode-parser";
import { TorrentRow } from "./media-detail-page.torrent-row";

type MediaEpisodePanelProps = {
  t: (key: string) => string;
  groups: MediaEpisodeGroup[];
  loading: boolean;
  error: string | null;
  selectedGroup: MediaEpisodeGroup | null;
  playerStatusMap: Record<string, PlayerTransmissionTaskStatus>;
  playerEnabled: boolean;
  onOpenEpisode: (key: string) => void;
  onCloseEpisode: () => void;
};

export function MediaEpisodePanel({
  t,
  groups,
  loading,
  error,
  selectedGroup,
  playerStatusMap,
  playerEnabled,
  onOpenEpisode,
  onCloseEpisode
}: MediaEpisodePanelProps) {
  return (
    <div className="media-episode-panel">
      <Group justify="space-between" gap="xs" wrap="wrap" mb={8}>
        <Group gap={6}>
          <Text size="sm" fw={700}>{t("media.detail.detectedEpisodes")}</Text>
          <Badge variant="light">{groups.length}</Badge>
        </Group>
        {loading ? (
          <Group gap={6}>
            <Loader size={14} />
            <Text size="xs" c="dimmed">{t("media.detail.episodeLoading")}</Text>
          </Group>
        ) : null}
      </Group>

      {error ? <Text size="xs" c="red">{t("media.detail.episodeLoadFailed")}</Text> : null}
      {!loading && !error && groups.length === 0 ? (
        <Text size="xs" c="dimmed">{t("media.detail.episodeEmpty")}</Text>
      ) : null}

      {groups.length > 0 ? (
        <div className="media-episode-grid">
          {groups.map((group) => (
            <Tooltip
              key={group.key}
              label={`${t("media.detail.episodeTorrents")}: ${group.torrents.length}`}
            >
              <button
                type="button"
                className="media-episode-tile"
                onClick={() => onOpenEpisode(group.key)}
                aria-label={`${t("media.detail.episode")} ${group.displayLabel}`}
              >
                <span>{group.displayLabel}</span>
                <small>{group.torrents.length}</small>
              </button>
            </Tooltip>
          ))}
        </div>
      ) : null}

      <Modal
        opened={Boolean(selectedGroup)}
        onClose={onCloseEpisode}
        title={selectedGroup ? `${t("media.detail.episode")} ${selectedGroup.displayLabel}` : t("media.detail.detectedEpisodes")}
        size="min(96vw, 1280px)"
        centered
        classNames={{
          content: "media-episode-modal-content",
          body: "media-episode-modal-body"
        }}
      >
        {selectedGroup ? (
          <Stack gap="sm" className="media-episode-modal-stack">
            <Group gap="xs">
              <Badge variant="light">{selectedGroup.torrents.length} {t("media.detail.episodeTorrents")}</Badge>
            </Group>
            <ScrollArea className="media-episode-modal-table-scroll">
              <Table className="media-torrent-snapshot-table" striped withTableBorder highlightOnHover miw={1040}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("torrents.table.title")}</Table.Th>
                    <Table.Th>{t("torrents.table.seeders")}</Table.Th>
                    <Table.Th>{t("torrents.table.leechers")}</Table.Th>
                    <Table.Th>{t("torrents.table.size")}</Table.Th>
                    <Table.Th>{t("torrents.table.filesCount")}</Table.Th>
                    <Table.Th>{t("media.detail.resolution")}</Table.Th>
                    <Table.Th>{t("torrents.table.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {selectedGroup.torrents.map((entry) => (
                    <TorrentRow
                      key={`${selectedGroup.key}:${entry.torrent.infoHash}`}
                      item={entry.torrent}
                      t={t}
                      playerStatus={playerStatusMap[entry.torrent.infoHash.trim().toLowerCase()]}
                      playerEnabled={playerEnabled}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        ) : null}
      </Modal>
    </div>
  );
}

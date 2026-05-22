"use client";

import Link from "next/link";
import { ActionIcon, Badge, Button, Card, Group, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { Copy, ExternalLink, Eye } from "lucide-react";
import { torrentOrderFields } from "@/lib/domain";
import type { TorrentRow } from "./torrents-page.helpers";
import { buildTorrentDetailHref, formatBytes, highlightSearchText } from "./torrents-page.helpers";

type TorrentResultsCardProps = {
  t: (key: string) => string;
  loading: boolean;
  items: TorrentRow[];
  orderBy: (typeof torrentOrderFields)[number];
  descending: boolean;
  orderLabels: Record<(typeof torrentOrderFields)[number], string>;
  queryString: string;
  currentListHref: string;
  renderContentType: (type?: string | null) => string;
  onChangeOrder: (field: (typeof torrentOrderFields)[number]) => void;
  onChangeDescending: (descending: boolean) => void;
  onCopyHash: (hash: string) => void;
  onOpenMagnet: (magnetUri?: string | null) => void;
  onOpenDetail: (item: TorrentRow) => void;
};

export function TorrentResultsCard({
  t,
  loading,
  items,
  orderBy,
  descending,
  orderLabels,
  queryString,
  currentListHref,
  renderContentType,
  onChangeOrder,
  onChangeDescending,
  onCopyHash,
  onOpenMagnet,
  onOpenDetail
}: TorrentResultsCardProps) {
  return (
    <Card className="glass-card torrent-results-card" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap">
          <Group gap={8} className="sort-button-group">
            {torrentOrderFields.map((field) => (
              <Button
                key={field}
                size="xs"
                variant={orderBy === field ? "light" : "subtle"}
                color={orderBy === field ? "cyan" : "slate"}
                onClick={() => onChangeOrder(field)}
              >
                {orderLabels[field]}
              </Button>
            ))}
          </Group>
          <Group gap={8} className="sort-button-group">
            <Button
              size="xs"
              variant={descending ? "light" : "subtle"}
              color={descending ? "cyan" : "slate"}
              onClick={() => onChangeDescending(true)}
            >
              {t("common.desc")}
            </Button>
            <Button
              size="xs"
              variant={!descending ? "light" : "subtle"}
              color={!descending ? "cyan" : "slate"}
              onClick={() => onChangeDescending(false)}
            >
              {t("common.asc")}
            </Button>
          </Group>
        </Group>

        {loading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : items.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            {t("torrents.noResults")}
          </Text>
        ) : (
          items.map((item) => (
            <Card key={item.infoHash} className="torrent-list-item" withBorder>
              <Stack gap={8} className="torrent-resource-card">
                <Group wrap="nowrap" justify="space-between" align="flex-start">
                  <Group wrap="nowrap" className="torrent-title-group">
                    <Link href={buildTorrentDetailHref(item.infoHash, currentListHref)} className="unstyled-link torrent-list-link">
                      <Text fw={800} lineClamp={1} title={item.title || item.torrent.name} className="torrent-resource-title">
                        {highlightSearchText(item.title || item.torrent.name, queryString)}
                      </Text>
                    </Link>
                    {renderContentType(item.contentType) ? (
                      <Badge variant="light" color="violet">
                        {renderContentType(item.contentType)}
                      </Badge>
                    ) : null}
                  </Group>
                </Group>

                <Group gap={6} wrap="wrap" className="torrent-resource-meta">
                  <Text size="xs" c="dimmed" ff="monospace" className="detail-code-line">
                    {highlightSearchText(item.infoHash, queryString)}
                  </Text>
                  <Badge size="xs" variant="dot" color="cyan">
                    {item.torrent.sources[0]?.name || "-"}
                  </Badge>
                </Group>

                <Group justify="space-between" wrap="wrap" gap={8}>
                  <Group gap={8} wrap="wrap" className="card-meta-row">
                    <Badge variant="light">{formatBytes(item.torrent.size)}</Badge>
                    <Badge variant="light">
                      {t("torrents.table.filesCount")}: {item.torrent.filesCount ?? (item.torrent.singleFile ? 1 : "-")}
                    </Badge>
                    <Badge variant="light" color="teal">
                      {t("torrents.table.seeders")}: {item.seeders ?? item.torrent.seeders ?? "-"}
                    </Badge>
                    <Badge variant="light" color="orange">
                      {t("torrents.table.leechers")}: {item.leechers ?? item.torrent.leechers ?? "-"}
                    </Badge>
                  </Group>
                  <Group gap={6}>
                    <Tooltip label={t("torrents.copyHash")}>
                      <ActionIcon className="app-icon-btn" variant="light" onClick={() => onCopyHash(item.infoHash)}>
                        <Copy size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("torrents.openMagnet")}>
                      <ActionIcon
                        className="app-icon-btn"
                        variant="light"
                        onClick={() => onOpenMagnet(item.torrent.magnetUri)}
                        disabled={!item.torrent.magnetUri}
                      >
                        <ExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("torrents.details")}>
                      <ActionIcon className="app-icon-btn" variant="light" onClick={() => onOpenDetail(item)}>
                        <Eye size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Card>
  );
}

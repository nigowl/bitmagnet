"use client";

import { ActionIcon, Badge, Group, Loader, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import { Ban, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import type { PlayerTransmissionCacheQueueItem } from "@/lib/media-api";

type QueueCacheTableProps = {
  t: (key: string) => string;
  items: PlayerTransmissionCacheQueueItem[];
  loading: boolean;
  actioning: Record<string, boolean>;
  onCancel: (infoHash: string) => void;
  onDelete: (infoHash: string) => void;
};

export function QueueCacheTable({
  t,
  items,
  loading,
  actioning,
  onCancel,
  onDelete
}: QueueCacheTableProps) {
  return (
    <ScrollArea>
      <Table striped highlightOnHover withTableBorder miw={980}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("queue.cacheTable.name")}</Table.Th>
            <Table.Th>{t("queue.cacheTable.status")}</Table.Th>
            <Table.Th>{t("queue.cacheTable.progress")}</Table.Th>
            <Table.Th>{t("queue.cacheTable.updatedAt")}</Table.Th>
            <Table.Th>{t("queue.cacheTable.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              </Table.Td>
            </Table.Tr>
          ) : items.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="md">
                  {t("queue.cacheEmpty")}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            items.map((item) => {
              const queueState = item.queueState?.trim().toLowerCase() || "";
              const canCancel = queueState === "pending" || queueState === "running";
              const loadingItem = Boolean(actioning[item.infoHash]);
              return (
                <Table.Tr key={item.infoHash}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="sm" lineClamp={1} title={item.name}>{item.name || "-"}</Text>
                      <Text size="xs" c="dimmed" ff="monospace" lineClamp={1} title={item.infoHash}>
                        {item.infoHash}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Badge variant="light" color={resolveQueueColor(queueState)} w="fit-content">
                        {resolveQueueLabel(queueState, item, t)}
                      </Badge>
                      {item.queuePosition ? (
                        <Text size="xs" c="dimmed">
                          {t("queue.cachePosition")}: {item.queuePosition}
                        </Text>
                      ) : null}
                      {item.errorMessage ? <Text size="xs" c="red">{item.errorMessage}</Text> : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="sm">{formatPercent(item.progress)}</Text>
                      {item.exists ? (
                        <Text size="xs" c="dimmed">
                          {item.state || "-"} {item.torrentId > 0 ? `#${item.torrentId}` : ""}
                        </Text>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{formatDateTime(item.updatedAt)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      {canCancel ? (
                        <Tooltip label={t("common.cancel")} withArrow>
                          <ActionIcon
                            className="app-icon-btn"
                            variant="light"
                            color="orange"
                            loading={loadingItem}
                            onClick={() => onCancel(item.infoHash)}
                            aria-label={t("common.cancel")}
                          >
                            <Ban size={14} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                      <Tooltip label={t("common.delete")} withArrow>
                        <ActionIcon
                          className="app-icon-btn"
                          variant="light"
                          color="red"
                          loading={loadingItem}
                          onClick={() => onDelete(item.infoHash)}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function resolveQueueColor(state: string): string {
  switch (state) {
    case "done":
      return "green";
    case "running":
    case "pending":
      return "orange";
    case "failed":
      return "red";
    case "canceled":
      return "gray";
    default:
      return "slate";
  }
}

function resolveQueueLabel(
  state: string,
  item: PlayerTransmissionCacheQueueItem,
  t: (key: string) => string
): string {
  if (item.exists && item.progress >= 0.999) {
    return t("media.detail.cacheDone");
  }
  switch (state) {
    case "done":
      return t("media.detail.cacheDone");
    case "running":
    case "pending":
      return t("media.detail.cacheRunning");
    case "failed":
      return t("media.detail.cacheRetry");
    case "canceled":
      return t("media.detail.cacheCanceled");
    default:
      return t("media.detail.cacheTorrent");
  }
}

function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, value || 0)) * 100).toFixed(1)}%`;
}

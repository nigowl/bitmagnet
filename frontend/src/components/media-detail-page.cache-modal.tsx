"use client";

import { Badge, Button, Group, Modal, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import type { PlayerTransmissionTaskStatus } from "@/lib/media-api";

type CacheStatusModalItem = {
  infoHash?: string;
  title?: string;
  torrent?: {
    name?: string;
  };
};

type MediaDetailCacheStatusModalProps = {
  t: (key: string) => string;
  item: CacheStatusModalItem | null;
  status?: PlayerTransmissionTaskStatus;
  opened: boolean;
  loading?: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
};

export function MediaDetailCacheStatusModal({
  t,
  item,
  status,
  opened,
  loading = false,
  onClose,
  onCancel,
  onDelete
}: MediaDetailCacheStatusModalProps) {
  const queueState = status?.queueState?.trim().toLowerCase() || "";
  const queuePosition = status?.queuePosition || 0;
  const progress = Math.max(0, Math.min(1, status?.progress || 0));
  const canCancel = Boolean(onCancel) && (queueState === "pending" || queueState === "running");
  const canDelete = Boolean(onDelete) && Boolean(status?.exists || queueState);

  return (
    <Modal opened={opened} onClose={onClose} title={t("media.detail.cacheStatusTitle")} centered size={560}>
      <Stack gap="md">
        <div>
          <Text fw={600} size="sm" lineClamp={2} title={item?.title || item?.torrent?.name}>
            {item?.title || item?.torrent?.name || "-"}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">{item?.infoHash || "-"}</Text>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">{t("media.detail.cacheStatus")}</Text>
            <Badge variant="light" color={resolveQueueColor(queueState)} w="fit-content">
              {resolveQueueLabel(queueState, status, t)}
            </Badge>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">{t("media.detail.cacheTaskState")}</Text>
            <Text size="sm">{status?.exists ? status.state || "-" : t("media.detail.cacheTaskMissing")}</Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">{t("media.detail.cachePosition")}</Text>
            <Text size="sm">{queuePosition > 0 ? queuePosition : "-"}</Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">{t("media.detail.cacheProgress")}</Text>
            <Text size="sm">{formatPercent(progress)}</Text>
          </Stack>
        </SimpleGrid>

        <Stack gap={6}>
          <Progress value={progress * 100} color={progress >= 0.999 ? "green" : "orange"} radius="xl" />
          {status?.exists ? <Text size="xs" c="dimmed">{t("media.detail.cacheTaskReady")}</Text> : null}
        </Stack>

        {queueState === "failed" && status?.queueState ? (
          <Text size="sm" c="red">{t("media.detail.cacheFailedHint")}</Text>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.close")}
          </Button>
          {canCancel ? (
            <Button color="orange" variant="light" loading={loading} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          ) : null}
          {canDelete ? (
            <Button color="red" loading={loading} onClick={onDelete}>
              {t("common.delete")}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
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
  status: PlayerTransmissionTaskStatus | undefined,
  t: (key: string) => string
): string {
  if (status?.exists && (status.progress || 0) >= 0.999) {
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

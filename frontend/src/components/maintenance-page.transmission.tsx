"use client";

import { ActionIcon, Button, Group, Loader, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import { Trash2 } from "lucide-react";
import type { TransmissionTaskItem } from "./maintenance-page.types";

type Translate = (key: string, ...args: unknown[]) => string;

type MaintenanceTransmissionPanelProps = {
  t: Translate;
  tasks: TransmissionTaskItem[];
  loading: boolean;
  cleanupRunning: boolean;
  deleting: Record<number, boolean>;
  onRefresh: () => void;
  onCleanup: () => void;
  onDelete: (taskId: number) => void;
};

export function MaintenanceTransmissionPanel({
  t,
  tasks,
  loading,
  cleanupRunning,
  deleting,
  onRefresh,
  onCleanup,
  onDelete
}: MaintenanceTransmissionPanelProps) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text size="sm" c="dimmed">{t("settings.playerTransmissionTasksHint")}</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" loading={loading} onClick={onRefresh}>
            {t("common.refresh")}
          </Button>
          <Button size="xs" variant="light" loading={cleanupRunning} onClick={onCleanup}>
            {t("settings.playerTransmissionRunCleanup")}
          </Button>
        </Group>
      </Group>

      {loading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : tasks.length === 0 ? (
        <Text size="sm" c="dimmed">{t("settings.playerTransmissionTasksEmpty")}</Text>
      ) : (
        <ScrollArea type="auto" scrollbarSize={8}>
          <Table striped withTableBorder highlightOnHover miw={980}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("settings.playerTransmissionTaskId")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskName")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskStatus")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskProgress")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskSpeed")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskUpdatedAt")}</Table.Th>
                <Table.Th>{t("settings.playerTransmissionTaskActions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tasks.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{item.id}</Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="sm" lineClamp={1} title={item.name}>{item.name || "-"}</Text>
                      <Text size="xs" c="dimmed" ff="monospace" lineClamp={1} title={item.hashString}>
                        {item.hashString || "-"}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{transmissionStatusLabel(item.status, t)}</Table.Td>
                  <Table.Td>{formatPercent(item.percentDone)}</Table.Td>
                  <Table.Td>{formatRateCompact(item.rateDownload || 0)}</Table.Td>
                  <Table.Td>{formatUnixDateTime(item.activityAtUnix || item.addedAtUnix)}</Table.Td>
                  <Table.Td>
                    <Tooltip label={t("settings.playerTransmissionTaskDelete")} withArrow>
                      <ActionIcon
                        className="app-icon-btn"
                        variant="light"
                        color="red"
                        loading={Boolean(deleting[item.id])}
                        onClick={() => onDelete(item.id)}
                        aria-label={t("settings.playerTransmissionTaskDelete")}
                      >
                        <Trash2 size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}

function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, value || 0)) * 100).toFixed(1)}%`;
}

function formatUnixDateTime(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "-";
  const parsed = new Date(unixSeconds * 1000);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function formatBytesCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const fixed = size >= 10 ? size.toFixed(0) : size.toFixed(1);
  return `${fixed} ${units[unit]}`;
}

function formatRateCompact(value: number): string {
  return `${formatBytesCompact(value)}/s`;
}

function transmissionStatusLabel(status: number, t: Translate): string {
  switch (status) {
    case 0:
      return t("settings.playerTransmissionStatusStopped");
    case 1:
      return t("settings.playerTransmissionStatusCheckWait");
    case 2:
      return t("settings.playerTransmissionStatusChecking");
    case 3:
      return t("settings.playerTransmissionStatusDownloadWait");
    case 4:
      return t("settings.playerTransmissionStatusDownloading");
    case 5:
      return t("settings.playerTransmissionStatusSeedWait");
    case 6:
      return t("settings.playerTransmissionStatusSeeding");
    default:
      return `${t("settings.playerTransmissionStatusUnknown")} (${status})`;
  }
}

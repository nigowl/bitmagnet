"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/languages/provider";

type MaintenanceTaskType = "fix_localized_metadata" | "fix_cover_cache";
type MaintenanceTaskStatus = "pending" | "running" | "success" | "failed";

type MaintenanceTask = {
  id: string;
  type: MaintenanceTaskType;
  limit: number;
  status: MaintenanceTaskStatus;
  requested: number;
  processed: number;
  updated: number;
  remaining: number;
  failed: number;
  message?: string;
  error?: string;
  logs?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

type StartMaintenanceResponse = {
  task: MaintenanceTask;
};

type TaskStatusResponse = {
  task: MaintenanceTask;
};

type MaintenanceStatsResponse = {
  stats: {
    type: MaintenanceTaskType;
    pending: number;
  };
};

type TransmissionTaskItem = {
  id: number;
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  leftUntilDone: number;
  sizeWhenDone: number;
  addedAtUnix: number;
  activityAtUnix: number;
  isFinished: boolean;
  downloadDir: string;
  errorString: string;
};

type TransmissionTasksResponse = {
  tasks: TransmissionTaskItem[];
};

type TransmissionCleanupResponse = {
  result: {
    success: boolean;
    totalBefore: number;
    removedCount: number;
    removedIds: number[];
    reasons: string[];
    estimatedFreeGain: number;
  };
};

type TransmissionDeleteTaskResponse = {
  result: {
    success: boolean;
    id: number;
  };
};

export function MaintenancePage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [activeTab, setActiveTab] = useState<string>("tasks");
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("fix_localized_metadata");
  const [limit, setLimit] = useState(10);
  const [starting, setStarting] = useState(false);
  const [task, setTask] = useState<MaintenanceTask | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [transmissionTasks, setTransmissionTasks] = useState<TransmissionTaskItem[]>([]);
  const [transmissionTasksLoading, setTransmissionTasksLoading] = useState(false);
  const [transmissionCleanupRunning, setTransmissionCleanupRunning] = useState(false);
  const [transmissionTaskDeleting, setTransmissionTaskDeleting] = useState<Record<number, boolean>>({});

  const refreshPending = useCallback(async (type: MaintenanceTaskType) => {
    if (!user || !isAdmin) {
      return;
    }
    setPendingLoading(true);
    try {
      const data = await apiRequest<MaintenanceStatsResponse>(
        `/api/admin/maintenance/stats?type=${encodeURIComponent(type)}`
      );
      setPending(data.stats.pending);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPendingLoading(false);
    }
  }, [isAdmin, user]);

  const refreshTask = useCallback(async (taskId: string) => {
    setRefreshing(true);
    try {
      const data = await apiRequest<TaskStatusResponse>(`/api/admin/maintenance/tasks/${encodeURIComponent(taskId)}`);
      setTask(data.task);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadTransmissionTasks = useCallback(async () => {
    if (!isAdmin) return;
    setTransmissionTasksLoading(true);
    try {
      const data = await apiRequest<TransmissionTasksResponse>("/api/admin/settings/player/transmission/tasks");
      setTransmissionTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTransmissionTasksLoading(false);
    }
  }, [isAdmin]);

  const cleanupTransmissionTasks = useCallback(async () => {
    setTransmissionCleanupRunning(true);
    try {
      const data = await apiRequest<TransmissionCleanupResponse>("/api/admin/settings/player/transmission/tasks/cleanup", {
        method: "POST"
      });
      const removed = data.result?.removedCount ?? 0;
      notifications.show({
        color: removed > 0 ? "green" : "blue",
        message: removed > 0
          ? `${t("settings.playerTransmissionCleanupDone")}: ${removed}`
          : t("settings.playerTransmissionCleanupNoop")
      });
      await loadTransmissionTasks();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTransmissionCleanupRunning(false);
    }
  }, [loadTransmissionTasks, t]);

  const deleteTransmissionTask = useCallback(async (taskId: number) => {
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    setTransmissionTaskDeleting((current) => ({ ...current, [taskId]: true }));
    try {
      await apiRequest<TransmissionDeleteTaskResponse>(`/api/admin/settings/player/transmission/tasks/${taskId}?deleteData=true`, {
        method: "DELETE"
      });
      setTransmissionTasks((current) => current.filter((item) => item.id !== taskId));
      notifications.show({ color: "green", message: t("settings.playerTransmissionTaskDeleted") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTransmissionTaskDeleting((current) => ({ ...current, [taskId]: false }));
    }
  }, [t]);

  useEffect(() => {
    if (!task || (task.status !== "pending" && task.status !== "running")) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTask(task.id);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshTask, task]);

  useEffect(() => {
    if (!user || !isAdmin) {
      return;
    }
    void refreshPending(taskType);
  }, [taskType, user, isAdmin, refreshPending]);

  useEffect(() => {
    if (!task || (task.status !== "success" && task.status !== "failed")) {
      return;
    }
    void refreshPending(task.type);
  }, [task, refreshPending]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "transmission") return;
    void loadTransmissionTasks();
  }, [activeTab, isAdmin, loadTransmissionTasks]);

  const startTask = async () => {
    setStarting(true);
    try {
      const data = await apiRequest<StartMaintenanceResponse>("/api/admin/maintenance/tasks", {
        method: "POST",
        data: {
          type: taskType,
          limit
        }
      });
      setTask(data.task);
      void refreshPending(taskType);
      notifications.show({ color: "green", message: t("maintenance.started") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setStarting(false);
    }
  };

  const progressPercent = useMemo(() => {
    if (!task || task.requested <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((task.processed / task.requested) * 100)));
  }, [task]);

  const refreshPage = async () => {
    await refreshPending(taskType);
    if (task) {
      await refreshTask(task.id);
    }
    await loadTransmissionTasks();
  };

  const pageBusy = pendingLoading || refreshing || transmissionTasksLoading || transmissionCleanupRunning;

  if (authLoading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Card className="glass-card" withBorder maw={560} mx="auto">
        <Stack>
          <Title order={2}>{t("auth.adminOnly")}</Title>
          <Text c="dimmed">{t("auth.adminOnlyDesc")}</Text>
          <Button leftSection={<LogIn size={15} />} w="fit-content" onClick={openLogin}>
            {t("auth.login")}
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card className="glass-card" withBorder>
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={4}>
            <Title order={2}>{t("maintenance.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("maintenance.subtitle")}</Text>
            <Text c="dimmed" size="sm" className="hint-text">{t("maintenance.queueWorkerHint")}</Text>
          </Stack>
          <Group>
            <Tooltip label={t("common.refresh")} withArrow>
              <ActionIcon
                className="app-icon-btn spin-on-active"
                data-spinning={pageBusy ? "true" : "false"}
                variant="default"
                size="lg"
                loading={pageBusy}
                onClick={() => void refreshPage()}
                aria-label={t("common.refresh")}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs className="app-tabs" value={activeTab} onChange={(value) => setActiveTab(value || "tasks")}>
          <Tabs.List grow>
            <Tabs.Tab value="tasks">{t("maintenance.tabTasks")}</Tabs.Tab>
            <Tabs.Tab value="transmission">{t("maintenance.tabTransmission")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="tasks" pt="md">
            <Stack gap="md">
              <Card className="settings-section-block" radius="lg">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Text size="sm" c="dimmed">
                      {t("maintenance.pendingCount")}: {pendingLoading ? "..." : (pending ?? 0)}
                    </Text>
                    <Button
                      leftSection={<PlayCircle size={14} />}
                      loading={starting}
                      onClick={() => void startTask()}
                    >
                      {t("maintenance.start")}
                    </Button>
                  </Group>

                  <Select
                    label={t("maintenance.taskType")}
                    value={taskType}
                    onChange={(value) => setTaskType((value as MaintenanceTaskType) || "fix_localized_metadata")}
                    data={[
                      { value: "fix_localized_metadata", label: t("maintenance.taskOptions.fixLocalized") },
                      { value: "fix_cover_cache", label: t("maintenance.taskOptions.fixCoverCache") }
                    ]}
                    allowDeselect={false}
                  />

                  <NumberInput
                    label={t("maintenance.limit")}
                    value={limit}
                    min={1}
                    max={2000}
                    step={1}
                    onChange={(value) => setLimit(Number(value) || 10)}
                  />
                </Stack>
              </Card>

              {task ? (
                <Card className="settings-section-block" radius="lg">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Text fw={600}>{t("maintenance.currentTask")}</Text>
                      <Badge variant={task.status === "failed" ? "outline" : "light"}>
                        {t(`maintenance.status.${task.status}`)}
                      </Badge>
                    </Group>

                    <Text size="sm" c="dimmed">
                      {t("maintenance.taskId")}: {task.id}
                    </Text>

                    <Text size="sm">
                      {t("maintenance.taskType")}:{" "}
                      {task.type === "fix_localized_metadata"
                        ? t("maintenance.taskOptions.fixLocalized")
                        : t("maintenance.taskOptions.fixCoverCache")}
                    </Text>

                    <Progress value={progressPercent} animated={task.status === "running" || task.status === "pending"} />

                    <Group gap="xs" wrap="wrap">
                      <Badge variant="light">{t("maintenance.metrics.requested")}: {task.requested}</Badge>
                      <Badge variant="light">{t("maintenance.metrics.processed")}: {task.processed}</Badge>
                      <Badge variant="light">{t("maintenance.metrics.updated")}: {task.updated}</Badge>
                      <Badge variant="light">{t("maintenance.metrics.failed")}: {task.failed}</Badge>
                      <Badge variant="outline">{t("maintenance.metrics.remaining")}: {task.remaining}</Badge>
                      <Badge variant="outline">{t("maintenance.metrics.duration")}: {task.durationMs || 0} ms</Badge>
                    </Group>

                    {task.message ? <Text size="sm">{task.message}</Text> : null}
                    {task.error ? <Text size="sm" c="red">{task.error}</Text> : null}
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        {t("maintenance.executionLogs")}
                      </Text>
                      {task.logs && task.logs.length > 0 ? (
                        <Stack gap={2}>
                          {task.logs.map((line, index) => (
                            <Text key={`${line}-${index}`} size="xs" c="dimmed">
                              {line}
                            </Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed">
                          {t("maintenance.logsEmpty")}
                        </Text>
                      )}
                    </Stack>
                  </Stack>
                </Card>
              ) : null}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="transmission" pt="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">{t("settings.playerTransmissionTasksHint")}</Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    loading={transmissionTasksLoading}
                    onClick={() => void loadTransmissionTasks()}
                  >
                    {t("common.refresh")}
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    loading={transmissionCleanupRunning}
                    onClick={() => void cleanupTransmissionTasks()}
                  >
                    {t("settings.playerTransmissionRunCleanup")}
                  </Button>
                </Group>
              </Group>

              {transmissionTasksLoading ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              ) : transmissionTasks.length === 0 ? (
                <Text size="sm" c="dimmed">{t("settings.playerTransmissionTasksEmpty")}</Text>
              ) : (
                <ScrollArea type="auto" scrollbarSize={8}>
                  <Table striped withTableBorder highlightOnHover miw={980}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskName")}</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskStatus")}</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskProgress")}</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskSpeed")}</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskUpdatedAt")}</Table.Th>
                        <Table.Th>{t("settings.playerTransmissionTaskActions")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {transmissionTasks.map((item) => (
                        <Table.Tr key={item.id}>
                          <Table.Td>{item.id}</Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" lineClamp={1} title={item.name}>{item.name || "-"}</Text>
                              <Text size="xs" c="dimmed" ff="monospace" lineClamp={1} title={item.hashString}>{item.hashString || "-"}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{transmissionStatusLabel(item.status)}</Table.Td>
                          <Table.Td>{(Math.max(0, Math.min(1, item.percentDone || 0)) * 100).toFixed(1)}%</Table.Td>
                          <Table.Td>{formatRateCompact(item.rateDownload || 0)}</Table.Td>
                          <Table.Td>{formatUnixDateTime(item.activityAtUnix || item.addedAtUnix)}</Table.Td>
                          <Table.Td>
                            <Tooltip label={t("settings.playerTransmissionTaskDelete")} withArrow>
                              <ActionIcon
                                className="app-icon-btn"
                                variant="light"
                                color="red"
                                loading={Boolean(transmissionTaskDeleting[item.id])}
                                onClick={() => void deleteTransmissionTask(item.id)}
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
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
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

function transmissionStatusLabel(status: number): string {
  switch (status) {
    case 0:
      return "stopped";
    case 1:
      return "check_wait";
    case 2:
      return "checking";
    case 3:
      return "download_wait";
    case 4:
      return "downloading";
    case 5:
      return "seed_wait";
    case 6:
      return "seeding";
    default:
      return `unknown_${status}`;
  }
}

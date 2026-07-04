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
  Select,
  Stack,
  Tabs,
  Text,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, PlayCircle, RefreshCw } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useTabsUnderline } from "@/lib/use-tabs-underline";
import { useI18n } from "@/languages/provider";
import { MaintenanceTransmissionPanel } from "./maintenance-page.transmission";
import type {
  AdminSettingsResponse,
  MaintenanceStatsResponse,
  MaintenanceTask,
  MaintenanceTaskType,
  StartMaintenanceResponse,
  TaskStatusResponse,
  TransmissionCleanupResponse,
  TransmissionDeleteTaskResponse,
  TransmissionTaskItem,
  TransmissionTasksResponse
} from "./maintenance-page.types";

function normalizeMaintenanceLimit(value: string | number): number {
  return Math.max(1, Math.min(2000, Number(value) || 10));
}

function normalizeMaintenanceBatchSize(value: string | number, limit: number, fallback = limit): number {
  return Math.max(1, Math.min(limit, Number(value) || fallback));
}

export function MaintenancePage() {
  const { t } = useI18n();
  const tabsRef = useTabsUnderline();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [activeTab, setActiveTab] = useState<string>("tasks");
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("fix_localized_metadata");
  const [limit, setLimit] = useState(10);
  const [batchSize, setBatchSize] = useState(20);
  const [starting, setStarting] = useState(false);
  const [task, setTask] = useState<MaintenanceTask | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [transmissionTasks, setTransmissionTasks] = useState<TransmissionTaskItem[]>([]);
  const [transmissionTasksLoading, setTransmissionTasksLoading] = useState(false);
  const [transmissionCleanupRunning, setTransmissionCleanupRunning] = useState(false);
  const [transmissionTaskDeleting, setTransmissionTaskDeleting] = useState<Record<number, boolean>>({});
  const [playerEnabled, setPlayerEnabled] = useState(true);
  const [playerSettingsLoading, setPlayerSettingsLoading] = useState(false);

  const loadPlayerSettings = useCallback(async (): Promise<boolean> => {
    if (!isAdmin) return true;
    setPlayerSettingsLoading(true);
    try {
      const data = await apiRequest<AdminSettingsResponse>("/api/admin/settings");
      const enabled = data?.settings?.player?.enabled;
      const resolved = typeof enabled === "boolean" ? enabled : true;
      setPlayerEnabled(resolved);
      return resolved;
    } catch {
      setPlayerEnabled(true);
      return true;
    } finally {
      setPlayerSettingsLoading(false);
    }
  }, [isAdmin]);

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
      await apiRequest<TransmissionDeleteTaskResponse>(`/api/admin/settings/player/transmission/tasks/${taskId}`, {
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
    if (!isAdmin || !playerEnabled || activeTab !== "transmission") return;
    void loadTransmissionTasks();
  }, [activeTab, isAdmin, loadTransmissionTasks, playerEnabled]);

  useEffect(() => {
    if (!isAdmin) {
      setPlayerEnabled(true);
      return;
    }
    void loadPlayerSettings();
  }, [isAdmin, loadPlayerSettings]);

  useEffect(() => {
    if (!playerEnabled && activeTab === "transmission") {
      setActiveTab("tasks");
    }
  }, [activeTab, playerEnabled]);

  const startTask = async () => {
    const normalizedLimit = normalizeMaintenanceLimit(limit);
    const normalizedBatchSize = normalizeMaintenanceBatchSize(batchSize, normalizedLimit);
    const queuedJobs = Math.max(1, Math.ceil(normalizedLimit / normalizedBatchSize));

    setStarting(true);
    try {
      const data = await apiRequest<StartMaintenanceResponse>("/api/admin/maintenance/tasks", {
        method: "POST",
        data: {
          type: taskType,
          limit: normalizedLimit,
          batchSize: normalizedBatchSize
        }
      });
      setTask(data.task);
      void refreshPending(taskType);
      notifications.show({
        color: "green",
        message: queuedJobs > 1
          ? `${t("maintenance.started")} (${queuedJobs} x ${normalizedBatchSize})`
          : t("maintenance.started")
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setStarting(false);
    }
  };

  const normalizedLimitPreview = useMemo(
    () => normalizeMaintenanceLimit(limit),
    [limit]
  );
  const normalizedBatchPreview = useMemo(
    () => normalizeMaintenanceBatchSize(batchSize, normalizedLimitPreview),
    [batchSize, normalizedLimitPreview]
  );
  const queuedJobsPreview = useMemo(
    () => Math.max(1, Math.ceil(normalizedLimitPreview / normalizedBatchPreview)),
    [normalizedBatchPreview, normalizedLimitPreview]
  );

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
    const enabled = await loadPlayerSettings();
    if (enabled) {
      await loadTransmissionTasks();
    }
  };

  const pageBusy = pendingLoading || refreshing || transmissionTasksLoading || transmissionCleanupRunning || playerSettingsLoading;

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
        <Tabs ref={tabsRef} className="app-tabs" value={activeTab} onChange={(value) => setActiveTab(value || "tasks")}>
          <Tabs.List grow>
            <Tabs.Tab value="tasks">{t("maintenance.tabTasks")}</Tabs.Tab>
            {playerEnabled ? <Tabs.Tab value="transmission">{t("maintenance.tabTransmission")}</Tabs.Tab> : null}
          </Tabs.List>
          {!playerEnabled ? (
            <Text c="dimmed" size="xs" mt="xs">{t("maintenance.transmissionHiddenWhenPlayerDisabled")}</Text>
          ) : null}

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
                    onChange={(value) => setLimit(normalizeMaintenanceLimit(value))}
                  />

                  <NumberInput
                    label={t("maintenance.batchSize")}
                    value={batchSize}
                    min={1}
                    max={2000}
                    step={1}
                    onChange={(value) => setBatchSize(normalizeMaintenanceBatchSize(value, 2000, 20))}
                  />

                  <Text size="sm" c="dimmed">
                    {t("maintenance.batchPreview")}: {queuedJobsPreview} x {normalizedBatchPreview} = {normalizedLimitPreview}
                  </Text>
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

          {playerEnabled ? (
            <Tabs.Panel value="transmission" pt="md">
              <MaintenanceTransmissionPanel
                t={t}
                tasks={transmissionTasks}
                loading={transmissionTasksLoading}
                cleanupRunning={transmissionCleanupRunning}
                deleting={transmissionTaskDeleting}
                onRefresh={() => void loadTransmissionTasks()}
                onCleanup={() => void cleanupTransmissionTasks()}
                onDelete={(taskId) => void deleteTransmissionTask(taskId)}
              />
            </Tabs.Panel>
          ) : null}
        </Tabs>
      </Card>
    </Stack>
  );
}

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
  Text,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, PlayCircle, RefreshCw } from "lucide-react";
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

export function MaintenancePage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("fix_localized_metadata");
  const [limit, setLimit] = useState(10);
  const [starting, setStarting] = useState(false);
  const [task, setTask] = useState<MaintenanceTask | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);

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

  const refreshTask = async (taskId: string) => {
    setRefreshing(true);
    try {
      const data = await apiRequest<TaskStatusResponse>(`/api/admin/maintenance/tasks/${encodeURIComponent(taskId)}`);
      setTask(data.task);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!task || (task.status !== "pending" && task.status !== "running")) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTask(task.id);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [task]);

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
  };

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
            <Text c="dimmed">{t("maintenance.subtitle")}</Text>
            <Text c="dimmed" size="sm">{t("maintenance.queueWorkerHint")}</Text>
          </Stack>
          <Group>
            <Tooltip label={t("maintenance.start")} withArrow>
              <ActionIcon
                className="app-icon-btn"
                variant="light"
                size="lg"
                loading={starting}
                onClick={() => void startTask()}
                aria-label={t("maintenance.start")}
              >
                <PlayCircle size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("common.refresh")} withArrow>
              <ActionIcon
                className="app-icon-btn spin-on-active"
                data-spinning={pendingLoading || refreshing ? "true" : "false"}
                variant="default"
                size="lg"
                loading={pendingLoading || refreshing}
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
        <Stack gap="md">
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
          <Text size="sm" c="dimmed">
            {t("maintenance.pendingCount")}: {pendingLoading ? "..." : (pending ?? 0)}
          </Text>

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
        <Card className="glass-card" withBorder>
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
  );
}

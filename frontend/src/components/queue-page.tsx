"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  MultiSelect,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { CalendarSync, DatabaseBackup, Filter, LogIn, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import {
  QUEUE_JOBS_QUERY,
  QUEUE_METRICS_QUERY
} from "@/lib/graphql";
import { queueOrderFields, queueStatuses } from "@/lib/domain";
import { hoursAgoISO } from "@/lib/datetime";
import { parsePositiveIntParam } from "@/lib/url-params";
import { useI18n } from "@/languages/provider";
import {
  cancelPlayerTransmissionCache,
  deletePlayerTransmissionCache,
  fetchPlayerTransmissionCacheQueue,
  type PlayerTransmissionCacheQueueItem
} from "@/lib/media-api";
import {
  ALL_FILTER_OPTION,
  CHART_LINE_COLOR,
  CHART_TEXT_COLOR,
  CHART_TOOLTIP_BACKGROUND,
  KNOWN_QUEUE_NAMES,
  METRICS_CHART_PALETTE,
  type QueueJobsResponse,
  type QueueMetricsResponse,
  normalizeFilterSelection,
  uniqueSorted
} from "./queue-page.helpers";
import {
  openQueueCleanupSettingsModal,
  openQueueEnqueueModal,
  openQueuePurgeModal
} from "./queue-page.modals";
import { QueueCacheTable } from "./queue-page.cache-table";
import { QueueJobsTable } from "./queue-page.table";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function QueuePage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [orderBy, setOrderBy] = useState<(typeof queueOrderFields)[number]>("ran_at");
  const [descending, setDescending] = useState(true);
  const [queues, setQueues] = useState<string[]>([ALL_FILTER_OPTION]);
  const [statuses, setStatuses] = useState<string[]>([ALL_FILTER_OPTION]);
  const [result, setResult] = useState<QueueJobsResponse["queue"]["jobs"] | null>(null);
  const [metricsBuckets, setMetricsBuckets] = useState<QueueMetricsResponse["queue"]["metrics"]["buckets"]>([]);
  const [cacheItems, setCacheItems] = useState<PlayerTransmissionCacheQueueItem[]>([]);
  const [cacheActioning, setCacheActioning] = useState<Record<string, boolean>>({});
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { t } = useI18n();

  const renderStatusLabel = useCallback(
    (status: string) => {
      const key = `queue.statusValues.${status}`;
      const translated = t(key);
      return translated === key ? status : translated;
    },
    [t]
  );

  const normalizeQueueLabel = useCallback(
    (queueName: string, fallbackLabel?: string) => {
      const key = `queue.queueValues.${queueName}`;
      const translated = t(key);
      if (translated !== key) {
        return translated;
      }
      if (fallbackLabel) {
        return fallbackLabel;
      }
      return queueName.replaceAll("_", " ");
    },
    [t]
  );

  const formatPayload = useCallback((payload: string) => {
    const text = (payload || "").trim();
    if (!text) {
      return "-";
    }
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, []);

  const orderFieldLabels: Record<(typeof queueOrderFields)[number], string> = useMemo(
    () => ({
      ran_at: t("queue.order.ranAt"),
      created_at: t("queue.order.createdAt"),
      priority: t("queue.order.priority")
    }),
    [t]
  );

  const totalPages = useMemo(() => {
    if (!result?.totalCount) return 1;
    return Math.max(1, Math.ceil(result.totalCount / limit));
  }, [limit, result?.totalCount]);

  const activeQueueFilter = useMemo(
    () => (queues.includes(ALL_FILTER_OPTION) ? [] : queues),
    [queues]
  );
  const activeStatusFilter = useMemo(
    () => (statuses.includes(ALL_FILTER_OPTION) ? [] : statuses),
    [statuses]
  );

  const statusCountMap = useMemo(
    () =>
      new Map((result?.aggregations.status || []).map((item) => [item.value, item.count])),
    [result?.aggregations.status]
  );

  const queueAggregationItems = useMemo(() => {
    const aggregated = result?.aggregations.queue || [];
    const items = aggregated.map((item) => ({
      value: item.value,
      label: normalizeQueueLabel(item.value, item.label),
      count: item.count
    }));
    const knownMissing = KNOWN_QUEUE_NAMES
      .filter((name) => !aggregated.some((item) => item.value === name))
      .map((name) => ({
        value: name,
        label: normalizeQueueLabel(name),
        count: 0
      }));
    return [...items, ...knownMissing];
  }, [normalizeQueueLabel, result?.aggregations.queue]);

  const metricsOption = useMemo(() => {
    const latestBuckets = metricsBuckets.slice(-140);
    const bucketLabels = uniqueSorted(latestBuckets.map((item) => item.createdAtBucket));
    const labels = bucketLabels.map((value) => value.slice(11, 16));
    const bucketStatusMap = new Map<string, number>();
    for (const item of latestBuckets) {
      const key = `${item.createdAtBucket}@@${item.status}`;
      bucketStatusMap.set(key, (bucketStatusMap.get(key) || 0) + item.count);
    }

    const series = queueStatuses.map((status) => {
      return {
        name: renderStatusLabel(status),
        type: "line",
        smooth: true,
        showSymbol: false,
        stack: "total",
        areaStyle: { opacity: 0.25 },
        data: bucketLabels.map((bucket) => bucketStatusMap.get(`${bucket}@@${status}`) || 0)
      };
    });

    return {
      color: METRICS_CHART_PALETTE,
      tooltip: {
        trigger: "axis",
        backgroundColor: CHART_TOOLTIP_BACKGROUND,
        borderColor: CHART_LINE_COLOR,
        textStyle: { color: CHART_TEXT_COLOR }
      },
      legend: { textStyle: { color: CHART_TEXT_COLOR }, bottom: 0 },
      grid: { left: 34, right: 16, top: 40, bottom: 64, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: CHART_TEXT_COLOR, margin: 12 },
        axisLine: { lineStyle: { color: CHART_LINE_COLOR } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: CHART_TEXT_COLOR },
        splitLine: { lineStyle: { color: CHART_LINE_COLOR } }
      },
      series
    };
  }, [metricsBuckets, renderStatusLabel]);

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const startTime = hoursAgoISO(24);

      const [jobsData, metricsData, cacheQueueData] = await Promise.all([
        graphqlRequest<QueueJobsResponse>(QUEUE_JOBS_QUERY, {
          input: {
            limit,
            page,
            totalCount: true,
            hasNextPage: true,
            queues: activeQueueFilter.length ? activeQueueFilter : undefined,
            statuses: activeStatusFilter.length ? activeStatusFilter : undefined,
            orderBy: [
              { field: orderBy, descending },
              ...(orderBy !== "created_at" ? [{ field: "created_at", descending }] : [])
            ],
            facets: {
              queue: { aggregate: true, filter: activeQueueFilter.length ? activeQueueFilter : undefined },
              status: { aggregate: true, filter: activeStatusFilter.length ? activeStatusFilter : undefined }
            }
          }
        }),
        graphqlRequest<QueueMetricsResponse>(QUEUE_METRICS_QUERY, {
          input: { bucketDuration: "hour", startTime }
        }),
        fetchPlayerTransmissionCacheQueue()
      ]);

      setResult(jobsData.queue.jobs);
      setMetricsBuckets(metricsData.queue.metrics.buckets || []);
      setCacheItems(Array.isArray(cacheQueueData) ? cacheQueueData : []);
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoading(false);
    }
  }, [activeQueueFilter, activeStatusFilter, descending, isAdmin, limit, orderBy, page]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!expandedJobId) return;
    const exists = (result?.items || []).some((item) => item.id === expandedJobId);
    if (!exists) {
      setExpandedJobId(null);
    }
  }, [expandedJobId, result?.items]);

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

  const openPurgeModal = () => openQueuePurgeModal({ t, reload: load, queueAggregationItems });
  const openCleanupSettingsModal = () => openQueueCleanupSettingsModal(t);
  const openEnqueueModal = () => openQueueEnqueueModal({ t, reload: load });
  const runCacheAction = async (infoHash: string, action: "cancel" | "delete") => {
    setCacheActioning((current) => ({ ...current, [infoHash]: true }));
    try {
      if (action === "cancel") {
        await cancelPlayerTransmissionCache(infoHash);
        notifications.show({ color: "green", message: t("media.detail.cacheCanceled") });
      } else {
        await deletePlayerTransmissionCache(infoHash);
        notifications.show({ color: "green", message: t("media.detail.cacheDeleted") });
      }
      await load();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setCacheActioning((current) => {
        const next = { ...current };
        delete next[infoHash];
        return next;
      });
    }
  };
  const openCacheCancelModal = (infoHash: string) => modals.openConfirmModal({
    title: t("queue.cacheCancelTitle"),
    children: <Text size="sm">{t("queue.cacheCancelConfirm")}</Text>,
    labels: { confirm: t("common.cancel"), cancel: t("common.close") },
    confirmProps: { color: "orange" },
    onConfirm: async () => {
      await runCacheAction(infoHash, "cancel");
    }
  });
  const openCacheDeleteModal = (infoHash: string) => modals.openConfirmModal({
    title: t("queue.cacheDeleteTitle"),
    children: <Text size="sm">{t("queue.cacheDeleteConfirm")}</Text>,
    labels: { confirm: t("common.delete"), cancel: t("common.close") },
    confirmProps: { color: "red" },
    onConfirm: async () => {
      await runCacheAction(infoHash, "delete");
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("queue.title")}</Title>
          <Text c="dimmed" className="page-subtitle">{t("queue.subtitle")}</Text>
        </div>
        <Group>
          <Tooltip label={t("queue.enqueue")} withArrow>
            <ActionIcon className="app-icon-btn" variant="light" size="lg" onClick={openEnqueueModal} aria-label={t("queue.enqueue")}>
              <CalendarSync size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("queue.purge")} withArrow>
            <ActionIcon className="app-icon-btn" color="red" variant="light" size="lg" onClick={openPurgeModal} aria-label={t("queue.purge")}>
              <Trash2 size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("queue.cleanupSettings.button")} withArrow>
            <ActionIcon className="app-icon-btn" variant="light" size="lg" onClick={openCleanupSettingsModal} aria-label={t("queue.cleanupSettings.button")}>
              <Settings2 size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("common.refresh")} withArrow>
            <ActionIcon
              className="app-icon-btn spin-on-active"
              data-spinning={loading ? "true" : "false"}
              variant="default"
              size="lg"
              onClick={() => void load()}
              aria-label={t("common.refresh")}
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {queueStatuses.map((status) => (
          <Card key={status} className="glass-card" withBorder>
            <Text c="dimmed" size="sm">
              {t(`queue.statusValues.${status}`)}
            </Text>
            <Text fw={700} size="xl">
              {statusCountMap.get(status) ?? 0}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card className="glass-card queue-section-block" withBorder>
        <Group mb="sm">
          <DatabaseBackup size={16} />
          <Text fw={600}>{t("queue.queueSummaryTitle")}</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {queueAggregationItems.map((item) => (
            <Card key={item.value} className="queue-summary-item" radius="md" p="sm">
              <Text c="dimmed" size="sm">{item.label}</Text>
              <Text fw={700} size="lg">{item.count}</Text>
              <Text size="xs" c="dimmed">{item.value}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </Card>

      <Card className="glass-card" withBorder>
        <Group mb="sm" justify="space-between" wrap="wrap">
          <div>
            <Text fw={600}>{t("queue.cacheTitle")}</Text>
            <Text size="sm" c="dimmed">{t("queue.cacheSubtitle")}</Text>
          </div>
          <Badge variant="light">{cacheItems.length}</Badge>
        </Group>
        <QueueCacheTable
          t={t}
          items={cacheItems}
          loading={loading}
          actioning={cacheActioning}
          onCancel={openCacheCancelModal}
          onDelete={openCacheDeleteModal}
        />
      </Card>

      <Card className="glass-card" withBorder>
        <Group mb="sm">
          <Filter size={16} />
          <Text fw={600}>{t("queue.filters")}</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <MultiSelect
            label={t("queue.queueFilter")}
            data={[
              { value: ALL_FILTER_OPTION, label: `${t("queue.all")} (${result?.totalCount ?? 0})` },
              ...queueAggregationItems.map((item) => ({
                value: item.value,
                label: `${item.label} (${item.count})`
              }))
            ]}
            value={queues}
            onChange={(value) => {
              setQueues(normalizeFilterSelection(value));
              setPage(1);
            }}
            placeholder={t("queue.all")}
            searchable
          />
          <MultiSelect
            label={t("queue.statusFilter")}
            data={[
              { value: ALL_FILTER_OPTION, label: `${t("queue.all")} (${result?.totalCount ?? 0})` },
              ...queueStatuses.map((status) => ({
                value: status,
                label: `${t(`queue.statusValues.${status}`)} (${statusCountMap.get(status) ?? 0})`
              }))
            ]}
            value={statuses}
            onChange={(value) => {
              setStatuses(normalizeFilterSelection(value));
              setPage(1);
            }}
            placeholder={t("queue.all")}
          />
        </SimpleGrid>
      </Card>

      <Card className="glass-card glass-strong" withBorder>
        <Text fw={600} mb="sm">
          {t("queue.timeline")}
        </Text>
        <ECharts option={metricsOption} className="queue-metrics-chart" />
      </Card>

      <Card className="glass-card" withBorder>
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Group gap={8} className="sort-button-group">
            {queueOrderFields.map((value) => (
              <Button
                key={value}
                size="xs"
                variant={orderBy === value ? "light" : "subtle"}
                color={orderBy === value ? "cyan" : "slate"}
                onClick={() => {
                  setOrderBy(value);
                  setPage(1);
                }}
              >
                {orderFieldLabels[value]}
              </Button>
            ))}
          </Group>
          <Group gap={8} className="sort-button-group">
            <Button
              size="xs"
              variant={descending ? "light" : "subtle"}
              color={descending ? "cyan" : "slate"}
              onClick={() => {
                setDescending(true);
                setPage(1);
              }}
            >
              {t("common.desc")}
            </Button>
            <Button
              size="xs"
              variant={!descending ? "light" : "subtle"}
              color={!descending ? "cyan" : "slate"}
              onClick={() => {
                setDescending(false);
                setPage(1);
              }}
            >
              {t("common.asc")}
            </Button>
          </Group>
        </Group>

        <QueueJobsTable
          t={t}
          loading={loading}
          jobs={result?.items || []}
          expandedJobId={expandedJobId}
          formatPayload={formatPayload}
          normalizeQueueLabel={normalizeQueueLabel}
          renderStatusLabel={renderStatusLabel}
          onToggleExpandedJob={(jobId) => {
            setExpandedJobId((current) => (current === jobId ? null : jobId));
          }}
        />
      </Card>

      <Group justify="space-between">
        <Group gap="sm" wrap="wrap">
          <Text size="sm" c="dimmed">
            {t("common.total")}: {result?.totalCount || 0}
            {loading ? ` (${t("common.loading").toLowerCase()}...)` : ""}
          </Text>
          <Select
            size="xs"
            w={140}
            data={[
              { value: "20", label: `20 / ${t("common.page")}` },
              { value: "40", label: `40 / ${t("common.page")}` },
              { value: "60", label: `60 / ${t("common.page")}` },
              { value: "100", label: `100 / ${t("common.page")}` }
            ]}
            value={String(limit)}
            onChange={(value) => {
              setLimit(parsePositiveIntParam(value, 20));
              setPage(1);
            }}
          />
        </Group>
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>
    </Stack>
  );
}

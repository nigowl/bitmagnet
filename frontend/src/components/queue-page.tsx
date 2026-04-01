"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { CalendarSync, Filter, LogIn, RotateCcw, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import {
  QUEUE_ENQUEUE_REPROCESS_BATCH_MUTATION,
  QUEUE_JOBS_QUERY,
  QUEUE_METRICS_QUERY,
  QUEUE_PURGE_JOBS_MUTATION
} from "@/lib/graphql";
import { contentTypes, queueOrderFields, queueStatuses } from "@/lib/domain";
import { useI18n } from "@/languages/provider";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });
const allFilterOption = "__all__";

type QueueJob = {
  id: string;
  queue: string;
  status: string;
  payload: string;
  priority: number;
  retries: number;
  maxRetries: number;
  runAfter: string;
  ranAt?: string | null;
  error?: string | null;
  createdAt: string;
};

type QueueJobsResponse = {
  queue: {
    jobs: {
      totalCount: number;
      hasNextPage?: boolean | null;
      items: QueueJob[];
      aggregations: {
        queue: Array<{ value: string; label: string; count: number }>;
        status: Array<{ value: string; label: string; count: number }>;
      };
    };
  };
};

type QueueMetricsResponse = {
  queue: {
    metrics: {
      buckets: Array<{
        queue: string;
        status: string;
        createdAtBucket: string;
        count: number;
      }>;
    };
  };
};

export function QueuePage() {
  const { colorScheme } = useMantineColorScheme();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [orderBy, setOrderBy] = useState<(typeof queueOrderFields)[number]>("ran_at");
  const [descending, setDescending] = useState(true);
  const [queues, setQueues] = useState<string[]>([allFilterOption]);
  const [statuses, setStatuses] = useState<string[]>([allFilterOption]);
  const [result, setResult] = useState<QueueJobsResponse["queue"]["jobs"] | null>(null);
  const [metricsBuckets, setMetricsBuckets] = useState<QueueMetricsResponse["queue"]["metrics"]["buckets"]>([]);
  const { t } = useI18n();

  const renderStatusLabel = useCallback(
    (status: string) => {
      const key = `queue.statusValues.${status}`;
      const translated = t(key);
      return translated === key ? status : translated;
    },
    [t]
  );

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
    () => (queues.includes(allFilterOption) ? [] : queues),
    [queues]
  );
  const activeStatusFilter = useMemo(
    () => (statuses.includes(allFilterOption) ? [] : statuses),
    [statuses]
  );

  const statusCountMap = useMemo(
    () =>
      new Map((result?.aggregations.status || []).map((item) => [item.value, item.count])),
    [result?.aggregations.status]
  );

  const metricsOption = useMemo(() => {
    const chartTextColor = colorScheme === "dark" ? "#d8e1f0" : "#546072";
    const chartLineColor = colorScheme === "dark" ? "rgba(216,225,240,0.14)" : "rgba(84,96,114,0.14)";
    const chartTooltipBackground = colorScheme === "dark" ? "rgba(23,29,39,0.96)" : "rgba(255,255,255,0.96)";
    const chartPalette = colorScheme === "dark"
      ? ["#6cb6ff", "#59c9a5", "#f2cc60", "#ff9233", "#ff7b72"]
      : ["#2f6fed", "#18a374", "#d97706", "#ff7a00", "#dc2626"];
    const latestBuckets = metricsBuckets.slice(-140);
    const bucketLabels = Array.from(new Set(latestBuckets.map((item) => item.createdAtBucket))).sort();
    const labels = bucketLabels.map((value) => value.slice(11, 16));

    const series = queueStatuses.map((status) => {
      return {
        name: renderStatusLabel(status),
        type: "line",
        smooth: true,
        showSymbol: false,
        stack: "total",
        areaStyle: { opacity: 0.25 },
        data: bucketLabels.map((bucket) =>
          latestBuckets
            .filter((item) => item.createdAtBucket === bucket && item.status === status)
            .reduce((sum, item) => sum + item.count, 0)
        )
      };
    });

    return {
      color: chartPalette,
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartLineColor,
        textStyle: { color: chartTextColor }
      },
      legend: { textStyle: { color: chartTextColor }, bottom: 0 },
      grid: { left: 34, right: 16, top: 40, bottom: 64, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: chartTextColor, margin: 12 },
        axisLine: { lineStyle: { color: chartLineColor } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: chartTextColor },
        splitLine: { lineStyle: { color: chartLineColor } }
      },
      series
    };
  }, [colorScheme, metricsBuckets, renderStatusLabel]);

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [jobsData, metricsData] = await Promise.all([
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
        })
      ]);

      setResult(jobsData.queue.jobs);
      setMetricsBuckets(metricsData.queue.metrics.buckets || []);
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

  const openPurgeModal = () => {
    modals.openConfirmModal({
      title: t("queue.purgeTitle"),
      children: <Text size="sm">{t("queue.purgeHint")}</Text>,
      labels: { confirm: t("queue.purge"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await graphqlRequest(QUEUE_PURGE_JOBS_MUTATION, {
            input: {
              queues: activeQueueFilter.length ? activeQueueFilter : undefined,
              statuses: activeStatusFilter.length ? activeStatusFilter : undefined
            }
          });
          notifications.show({ color: "green", message: t("queue.purgeDone") });
          void load();
        } catch (error) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  };

  const openEnqueueModal = () => {
    const EnqueueForm = () => {
      const [purge, setPurge] = useState(true);
      const [classifierRematch, setClassifierRematch] = useState(false);
      const [apisDisabled, setApisDisabled] = useState(true);
      const [localSearchDisabled, setLocalSearchDisabled] = useState(true);
      const [orphans, setOrphans] = useState(false);
      const [batchSize, setBatchSize] = useState<number | "">("");
      const [chunkSize, setChunkSize] = useState<number | "">("");
      const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

      const submit = async () => {
        try {
          await graphqlRequest(QUEUE_ENQUEUE_REPROCESS_BATCH_MUTATION, {
            input: {
              purge,
              classifierRematch,
              apisDisabled,
              localSearchDisabled,
              orphans: orphans || undefined,
              batchSize: typeof batchSize === "number" ? batchSize : undefined,
              chunkSize: typeof chunkSize === "number" ? chunkSize : undefined,
              contentTypes: selectedTypes.length ? selectedTypes : undefined
            }
          });
          modals.closeAll();
          notifications.show({ color: "green", message: t("queue.enqueueDone") });
          void load();
        } catch (error) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        }
      };

      return (
        <Stack>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Checkbox label={t("queue.form.purge")} checked={purge} onChange={(e) => setPurge(e.currentTarget.checked)} />
            <Checkbox label={t("queue.form.classifierRematch")} checked={classifierRematch} onChange={(e) => setClassifierRematch(e.currentTarget.checked)} />
            <Checkbox label={t("queue.form.apisDisabled")} checked={apisDisabled} onChange={(e) => setApisDisabled(e.currentTarget.checked)} />
            <Checkbox label={t("queue.form.localSearchDisabled")} checked={localSearchDisabled} onChange={(e) => setLocalSearchDisabled(e.currentTarget.checked)} />
            <Checkbox label={t("queue.form.orphans")} checked={orphans} onChange={(e) => setOrphans(e.currentTarget.checked)} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <NumberInput label={t("queue.form.batchSize")} min={1} value={batchSize} onChange={(value) => setBatchSize(value === "" ? "" : Number(value))} />
            <NumberInput label={t("queue.form.chunkSize")} min={1} value={chunkSize} onChange={(value) => setChunkSize(value === "" ? "" : Number(value))} />
          </SimpleGrid>
          <MultiSelect
            label={t("queue.form.contentTypes")}
            data={contentTypes.map((item) => ({ value: item, label: t(`contentTypes.${item}`) }))}
            value={selectedTypes}
            onChange={setSelectedTypes}
          />
          <Group justify="flex-end" className="modal-footer">
            <Button onClick={() => modals.closeAll()} variant="default">
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()}>{t("queue.enqueue")}</Button>
          </Group>
        </Stack>
      );
    };

    modals.open({
      title: t("queue.enqueueTitle"),
      children: <EnqueueForm />,
      size: 680
    });
  };

  const normalizeFilterSelection = (values: string[]): string[] => {
    if (values.length === 0) {
      return [allFilterOption];
    }
    if (values.includes(allFilterOption) && values.length > 1) {
      return values.filter((value) => value !== allFilterOption);
    }
    if (values.length === 1 && values[0] === allFilterOption) {
      return [allFilterOption];
    }
    return values;
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("queue.title")}</Title>
          <Text c="dimmed">{t("queue.subtitle")}</Text>
        </div>
        <Group>
          <Button leftSection={<CalendarSync size={16} />} onClick={openEnqueueModal}>
            {t("queue.enqueue")}
          </Button>
          <Button leftSection={<Trash2 size={16} />} color="red" variant="light" onClick={openPurgeModal}>
            {t("queue.purge")}
          </Button>
          <Button leftSection={<RotateCcw size={16} />} variant="default" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
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

      <Card className="glass-card" withBorder>
        <Group mb="sm">
          <Filter size={16} />
          <Text fw={600}>{t("queue.filters")}</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <MultiSelect
            label={t("queue.queueFilter")}
            data={[
              { value: allFilterOption, label: `${t("queue.all")} (${result?.totalCount ?? 0})` },
              ...((result?.aggregations.queue || []).map((item) => ({
                value: item.value,
                label: `${item.label} (${item.count})`
              })))
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
              { value: allFilterOption, label: `${t("queue.all")} (${result?.totalCount ?? 0})` },
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
                color={orderBy === value ? "cyan" : "gray"}
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
              color={descending ? "cyan" : "gray"}
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
              color={!descending ? "cyan" : "gray"}
              onClick={() => {
                setDescending(false);
                setPage(1);
              }}
            >
              {t("common.asc")}
            </Button>
          </Group>
        </Group>

        <ScrollArea>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("queue.table.id")}</Table.Th>
                <Table.Th>{t("queue.table.queue")}</Table.Th>
                <Table.Th>{t("queue.table.status")}</Table.Th>
                <Table.Th>{t("queue.table.priority")}</Table.Th>
                <Table.Th>{t("queue.table.retries")}</Table.Th>
                <Table.Th>{t("queue.table.created")}</Table.Th>
                <Table.Th>{t("queue.table.ran")}</Table.Th>
                <Table.Th>{t("queue.table.error")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : (result?.items.length || 0) === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="md">
                      {t("queue.noJobs")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                (result?.items || []).map((job) => (
                  <Table.Tr key={job.id}>
                    <Table.Td>{job.id}</Table.Td>
                    <Table.Td>{job.queue}</Table.Td>
                    <Table.Td>
                      <Badge color={job.status === "failed" ? "red" : job.status === "processed" ? "green" : "yellow"}>
                        {renderStatusLabel(job.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{job.priority}</Table.Td>
                    <Table.Td>
                      {job.retries}/{job.maxRetries}
                    </Table.Td>
                    <Table.Td>{new Date(job.createdAt).toLocaleString()}</Table.Td>
                    <Table.Td>{job.ranAt ? new Date(job.ranAt).toLocaleString() : "-"}</Table.Td>
                    <Table.Td>{job.error || "-"}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
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
              setLimit(Number(value) || 20);
              setPage(1);
            }}
          />
        </Group>
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>
    </Stack>
  );
}

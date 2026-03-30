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
  Title
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { CalendarSync, Filter, RotateCcw, Trash2 } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [orderBy, setOrderBy] = useState<(typeof queueOrderFields)[number]>("ran_at");
  const [descending, setDescending] = useState(true);
  const [queues, setQueues] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
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

  const metricsOption = useMemo(() => {
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
      tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#d6e4ff" } },
      grid: { left: 34, right: 16, top: 40, bottom: 28 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value" },
      series
    };
  }, [metricsBuckets, renderStatusLabel]);

  const load = useCallback(async () => {
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
            queues: queues.length ? queues : undefined,
            statuses: statuses.length ? statuses : undefined,
            orderBy: [
              { field: orderBy, descending },
              ...(orderBy !== "created_at" ? [{ field: "created_at", descending }] : [])
            ],
            facets: {
              queue: { aggregate: true, filter: queues.length ? queues : undefined },
              status: { aggregate: true, filter: statuses.length ? statuses : undefined }
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
  }, [descending, limit, orderBy, page, queues, statuses]);

  useEffect(() => {
    void load();
  }, [load]);

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
              queues: queues.length ? queues : undefined,
              statuses: statuses.length ? statuses : undefined
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
          <Group justify="flex-end">
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

      <SimpleGrid cols={{ base: 1, lg: 4 }}>
        {(result?.aggregations.status || []).map((item) => (
          <Card key={item.value} className="glass-card" withBorder>
            <Text c="dimmed" size="sm">
              {t(`queue.statusValues.${item.value}`)}
            </Text>
            <Text fw={700} size="xl">
              {item.count}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card className="glass-card" withBorder>
        <Group mb="sm">
          <Filter size={16} />
          <Text fw={600}>{t("queue.filters")}</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 5 }}>
          <Select
            label={t("queue.orderBy")}
            data={queueOrderFields.map((value) => ({ value, label: orderFieldLabels[value] }))}
            value={orderBy}
            onChange={(value) => {
              if (!value) return;
              setOrderBy(value as (typeof queueOrderFields)[number]);
              setPage(1);
            }}
          />
          <Select
            label={t("queue.direction")}
            data={[
              { value: "desc", label: t("common.desc") },
              { value: "asc", label: t("common.asc") }
            ]}
            value={descending ? "desc" : "asc"}
            onChange={(value) => {
              setDescending(value !== "asc");
              setPage(1);
            }}
          />
          <NumberInput
            label={t("queue.pageSize")}
            min={5}
            max={100}
            value={limit}
            onChange={(value) => {
              setLimit(Number(value) || 20);
              setPage(1);
            }}
          />
          <MultiSelect
            label={t("queue.queueFilter")}
            data={(result?.aggregations.queue || []).map((item) => ({
              value: item.value,
              label: `${item.label} (${item.count})`
            }))}
            value={queues}
            onChange={(value) => {
              setQueues(value);
              setPage(1);
            }}
            searchable
          />
          <MultiSelect
            label={t("queue.statusFilter")}
            data={queueStatuses.map((status) => ({ value: status, label: t(`queue.statusValues.${status}`) }))}
            value={statuses}
            onChange={(value) => {
              setStatuses(value);
              setPage(1);
            }}
          />
        </SimpleGrid>
      </Card>

      <Card className="glass-card glass-strong" withBorder>
        <Text fw={600} mb="sm">
          {t("queue.timeline")}
        </Text>
        <ECharts option={metricsOption} style={{ height: 290 }} />
      </Card>

      <Card className="glass-card" withBorder>
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
        <Text size="sm" c="dimmed">
          {t("common.total")}: {result?.totalCount || 0}
          {loading ? ` (${t("common.loading").toLowerCase()}...)` : ""}
        </Text>
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>
    </Stack>
  );
}

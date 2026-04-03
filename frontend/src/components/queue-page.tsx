"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
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
  Tooltip,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { CalendarSync, DatabaseBackup, Filter, LogIn, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest, graphqlRequest } from "@/lib/api";
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

const knownQueueNames = [
  "process_torrent",
  "process_torrent_batch",
  "refresh_media_metadata",
  "backfill_cover_cache"
] as const;

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

type AdminQueueSettings = {
  cleanupCompletedMaxRecords: number;
  cleanupCompletedMaxAgeDays: number;
};

type AdminSettingsResponse = {
  settings: {
    performance: {
      queue: AdminQueueSettings;
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

  const queueAggregationItems = useMemo(() => {
    const aggregated = result?.aggregations.queue || [];
    const items = aggregated.map((item) => ({
      value: item.value,
      label: normalizeQueueLabel(item.value, item.label),
      count: item.count
    }));
    const knownMissing = knownQueueNames
      .filter((name) => !aggregated.some((item) => item.value === name))
      .map((name) => ({
        value: name,
        label: normalizeQueueLabel(name),
        count: 0
      }));
    return [...items, ...knownMissing];
  }, [normalizeQueueLabel, result?.aggregations.queue]);

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

  const openPurgeModal = () => {
    const PurgeForm = () => {
      const [taskQueue, setTaskQueue] = useState<string>(allFilterOption);
      const [submitting, setSubmitting] = useState(false);
      const queueOptions = [
        { value: allFilterOption, label: t("queue.purgeAllTypes") },
        ...queueAggregationItems.map((item) => ({ value: item.value, label: item.label }))
      ];

      const submit = async () => {
        setSubmitting(true);
        try {
          await graphqlRequest(QUEUE_PURGE_JOBS_MUTATION, {
            input: {
              queues: taskQueue === allFilterOption ? undefined : [taskQueue]
            }
          });
          notifications.show({ color: "green", message: t("queue.purgeDone") });
          modals.closeAll();
          void load();
        } catch (error) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        } finally {
          setSubmitting(false);
        }
      };

      return (
        <Stack>
          <Text size="sm">{t("queue.purgeHint")}</Text>
          <Select
            label={t("queue.form.taskType")}
            allowDeselect={false}
            value={taskQueue}
            data={queueOptions}
            onChange={(value) => setTaskQueue(value || allFilterOption)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => modals.closeAll()}>
              {t("common.cancel")}
            </Button>
            <Button color="red" onClick={() => void submit()} loading={submitting}>
              {t("queue.purge")}
            </Button>
          </Group>
        </Stack>
      );
    };

    modals.open({
      title: t("queue.purgeTitle"),
      children: <PurgeForm />,
      size: 560
    });
  };

  const openCleanupSettingsModal = () => {
    const CleanupSettingsForm = () => {
      const [loadingSettings, setLoadingSettings] = useState(true);
      const [savingSettings, setSavingSettings] = useState(false);
      const [maxRecords, setMaxRecords] = useState<number | "">(5000);
      const [maxAgeDays, setMaxAgeDays] = useState<number | "">(7);

      useEffect(() => {
        let mounted = true;
        const loadSettings = async () => {
          setLoadingSettings(true);
          try {
            const data = await apiRequest<AdminSettingsResponse>("/api/admin/settings");
            if (!mounted) return;
            setMaxRecords(data.settings.performance.queue.cleanupCompletedMaxRecords || 5000);
            setMaxAgeDays(data.settings.performance.queue.cleanupCompletedMaxAgeDays || 7);
          } catch (error) {
            if (!mounted) return;
            notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
          } finally {
            if (mounted) setLoadingSettings(false);
          }
        };
        void loadSettings();
        return () => {
          mounted = false;
        };
      }, []);

      const submit = async () => {
        if (typeof maxRecords !== "number" || typeof maxAgeDays !== "number") {
          notifications.show({ color: "red", message: t("queue.cleanupSettings.invalidInput") });
          return;
        }
        setSavingSettings(true);
        try {
          await apiRequest<AdminSettingsResponse>("/api/admin/settings", {
            method: "PUT",
            data: {
              performance: {
                queue: {
                  cleanupCompletedMaxRecords: maxRecords,
                  cleanupCompletedMaxAgeDays: maxAgeDays
                }
              }
            }
          });
          notifications.show({ color: "green", message: t("queue.cleanupSettings.saved") });
          modals.closeAll();
        } catch (error) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        } finally {
          setSavingSettings(false);
        }
      };

      return (
        <Stack>
          <Text c="dimmed" size="sm">
            {t("queue.cleanupSettings.hint")}
          </Text>
          {loadingSettings ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <NumberInput
                label={t("queue.cleanupSettings.maxRecords")}
                min={100}
                max={1000000}
                value={maxRecords}
                onChange={(value) => setMaxRecords(value === "" ? "" : Number(value))}
              />
              <NumberInput
                label={t("queue.cleanupSettings.maxAgeDays")}
                min={1}
                max={3650}
                value={maxAgeDays}
                onChange={(value) => setMaxAgeDays(value === "" ? "" : Number(value))}
              />
            </SimpleGrid>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => modals.closeAll()}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()} loading={savingSettings} disabled={loadingSettings}>
              {t("settings.save")}
            </Button>
          </Group>
        </Stack>
      );
    };

    modals.open({
      title: t("queue.cleanupSettings.title"),
      children: <CleanupSettingsForm />,
      size: 560
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
          <Text c="dimmed" size="sm">
            {t("queue.form.taskDescriptions.reprocessBatch")}
          </Text>

          <Checkbox label={t("queue.form.purge")} checked={purge} onChange={(e) => setPurge(e.currentTarget.checked)} />

          <SimpleGrid cols={{ base: 1, md: 2 }}>
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
        <Group mb="sm">
          <Filter size={16} />
          <Text fw={600}>{t("queue.filters")}</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <MultiSelect
            label={t("queue.queueFilter")}
            data={[
              { value: allFilterOption, label: `${t("queue.all")} (${result?.totalCount ?? 0})` },
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
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : (result?.items.length || 0) === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="md">
                      {t("queue.noJobs")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                (result?.items || []).map((job) => (
                  <Fragment key={job.id}>
                    <Table.Tr
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setExpandedJobId((current) => (current === job.id ? null : job.id));
                      }}
                    >
                      <Table.Td>{job.id}</Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{normalizeQueueLabel(job.queue)}</Text>
                          <Text size="xs" c="dimmed">{job.queue}</Text>
                        </Stack>
                      </Table.Td>
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
                    </Table.Tr>
                    {expandedJobId === job.id ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Card className="queue-detail-panel" radius="md" p="sm">
                            <Stack gap="sm">
                              <Text fw={600}>{t("queue.details.title")}</Text>
                              <SimpleGrid cols={{ base: 1, md: 2 }}>
                                <div>
                                  <Text c="dimmed" size="xs">{t("queue.details.queueRaw")}</Text>
                                  <Text size="sm">{job.queue}</Text>
                                </div>
                                <div>
                                  <Text c="dimmed" size="xs">{t("queue.details.nextRun")}</Text>
                                  <Text size="sm">{new Date(job.runAfter).toLocaleString()}</Text>
                                </div>
                              </SimpleGrid>
                              <div>
                                <Text c="dimmed" size="xs">{t("queue.details.payload")}</Text>
                                <ScrollArea.Autosize mah={180} type="auto">
                                  <Text ff="monospace" size="xs">{formatPayload(job.payload)}</Text>
                                </ScrollArea.Autosize>
                              </div>
                              <div>
                                <Text c="dimmed" size="xs">{t("queue.details.error")}</Text>
                                <ScrollArea.Autosize mah={140} type="auto">
                                  <Text ff="monospace" size="xs">{job.error || "-"}</Text>
                                </ScrollArea.Autosize>
                              </div>
                            </Stack>
                          </Card>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Fragment>
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

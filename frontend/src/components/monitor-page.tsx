"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ActionIcon, Badge, Button, Card, Group, Loader, ScrollArea, SimpleGrid, Stack, Table, Text, Title, Tooltip, useMantineColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Activity, LogIn, RefreshCw } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import { HEALTH_QUERY, QUEUE_METRICS_QUERY, TORRENT_METRICS_QUERY, VERSION_QUERY } from "@/lib/graphql";
import { useI18n } from "@/languages/provider";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type HealthResponse = {
  health: {
    status: string;
    checks: Array<{ key: string; status: string; timestamp: string; error?: string | null }>;
  };
  workers: {
    listAll: {
      workers: Array<{ key: string; enabled: boolean; started: boolean }>;
    };
  };
};

type VersionResponse = {
  version: string;
};

type QueueMetricsResponse = {
  queue: {
    metrics: {
      buckets: Array<{
        queue: string;
        status: string;
        createdAtBucket: string;
        ranAtBucket?: string | null;
        count: number;
        latency?: string | null;
      }>;
    };
  };
};

type TorrentMetricsResponse = {
  torrent: {
    metrics: {
      buckets: Array<{
        source: string;
        bucket: string;
        updated: boolean;
        count: number;
      }>;
    };
    listSources: {
      sources: Array<{
        key: string;
        name: string;
      }>;
    };
  };
};

export function MonitorPage() {
  const { t } = useI18n();
  const { colorScheme } = useMantineColorScheme();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse["health"] | null>(null);
  const [workers, setWorkers] = useState<HealthResponse["workers"]["listAll"]["workers"]>([]);
  const [version, setVersion] = useState("-");
  const [queueBuckets, setQueueBuckets] = useState<QueueMetricsResponse["queue"]["metrics"]["buckets"]>([]);
  const [torrentBuckets, setTorrentBuckets] = useState<TorrentMetricsResponse["torrent"]["metrics"]["buckets"]>([]);
  const [torrentSources, setTorrentSources] = useState<TorrentMetricsResponse["torrent"]["listSources"]["sources"]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const renderHealthStatus = useCallback(
    (status?: string | null) => {
      if (!status) return "-";
      const key = `monitor.statusValues.${status}`;
      const translated = t(key);
      return translated === key ? status : translated;
    },
    [t]
  );

  const queueStatusColor = useCallback((status: string) => {
    switch (status) {
      case "running":
        return "blue";
      case "pending":
        return "yellow";
      case "failed":
      case "retry":
        return "red";
      case "succeeded":
      case "done":
        return "green";
      default:
        return "gray";
    }
  }, []);

  const load = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [healthResp, versionResp, queueResp, torrentResp] = await Promise.all([
        graphqlRequest<HealthResponse>(HEALTH_QUERY),
        graphqlRequest<VersionResponse>(VERSION_QUERY),
        graphqlRequest<QueueMetricsResponse>(QUEUE_METRICS_QUERY, { input: { bucketDuration: "hour", startTime } }),
        graphqlRequest<TorrentMetricsResponse>(TORRENT_METRICS_QUERY, { input: { bucketDuration: "hour", startTime } })
      ]);

      setHealth(healthResp.health);
      setWorkers(healthResp.workers.listAll.workers || []);
      setVersion(versionResp.version || "-");
      setQueueBuckets(queueResp.queue.metrics.buckets || []);
      setTorrentBuckets(torrentResp.torrent.metrics.buckets || []);
      setTorrentSources(torrentResp.torrent.listSources.sources || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const workerSummary = useMemo(() => {
    const enabledCount = workers.filter((worker) => worker.enabled).length;
    const startedCount = workers.filter((worker) => worker.started).length;
    return {
      total: workers.length,
      enabled: enabledCount,
      started: startedCount
    };
  }, [workers]);

  const checkSummary = useMemo(() => {
    const checks = health?.checks || [];
    const downCount = checks.filter((check) => check.status === "down").length;
    const upCount = checks.filter((check) => check.status === "up").length;
    return {
      total: checks.length,
      down: downCount,
      up: upCount
    };
  }, [health?.checks]);

  const queueSummary = useMemo(() => {
    let total = 0;
    let latencyBuckets = 0;
    const statusTotals = new Map<string, number>();
    const queueTotals = new Map<string, number>();

    for (const bucket of queueBuckets) {
      total += bucket.count;
      statusTotals.set(bucket.status, (statusTotals.get(bucket.status) || 0) + bucket.count);
      queueTotals.set(bucket.queue, (queueTotals.get(bucket.queue) || 0) + bucket.count);
      if (bucket.latency) latencyBuckets += 1;
    }

    return {
      total,
      activeQueues: queueTotals.size,
      latencyBuckets,
      statusRows: Array.from(statusTotals.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count)
    };
  }, [queueBuckets]);

  const sourceNameMap = useMemo(() => {
    return new Map(torrentSources.map((source) => [source.key, source.name]));
  }, [torrentSources]);

  const torrentSummary = useMemo(() => {
    let total = 0;
    let updated = 0;
    const sourceTotals = new Map<string, number>();

    for (const bucket of torrentBuckets) {
      total += bucket.count;
      if (bucket.updated) updated += bucket.count;
      sourceTotals.set(bucket.source, (sourceTotals.get(bucket.source) || 0) + bucket.count);
    }

    return {
      total,
      updated,
      created: total - updated,
      activeSources: sourceTotals.size,
      sourceRows: Array.from(sourceTotals.entries())
        .map(([source, count]) => ({
          source,
          name: sourceNameMap.get(source) || source,
          count
        }))
        .sort((a, b) => b.count - a.count)
    };
  }, [sourceNameMap, torrentBuckets]);

  const queueOption = useMemo(() => {
    const chartTextColor = colorScheme === "dark" ? "#d8e1f0" : "#546072";
    const chartLineColor = colorScheme === "dark" ? "rgba(216,225,240,0.14)" : "rgba(84,96,114,0.14)";
    const chartTooltipBackground = colorScheme === "dark" ? "rgba(23,29,39,0.96)" : "rgba(255,255,255,0.96)";
    const chartPalette = colorScheme === "dark"
      ? ["#ff9233", "#59c9a5", "#6cb6ff", "#d2a8ff", "#f2cc60"]
      : ["#ff7a00", "#18a374", "#2f6fed", "#8b5cf6", "#d97706"];
    const points = queueBuckets.slice(-180);
    const statuses = Array.from(new Set(points.map((item) => item.status))).sort();
    const buckets = Array.from(new Set(points.map((item) => item.createdAtBucket))).sort();
    return {
      color: chartPalette,
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartLineColor,
        textStyle: { color: chartTextColor }
      },
      legend: { textStyle: { color: chartTextColor } },
      grid: { left: 34, right: 16, top: 40, bottom: 28 },
      xAxis: {
        type: "category",
        data: buckets.map((item) => item.slice(5, 16).replace("T", " ")),
        axisLabel: { color: chartTextColor },
        axisLine: { lineStyle: { color: chartLineColor } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: chartTextColor },
        splitLine: { lineStyle: { color: chartLineColor } }
      },
      series: statuses.map((status) => ({
        name: status,
        type: "line",
        stack: "queue",
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.25 },
        data: buckets.map((bucket) =>
          points
            .filter((item) => item.createdAtBucket === bucket && item.status === status)
            .reduce((sum, item) => sum + item.count, 0)
        )
      }))
    };
  }, [colorScheme, queueBuckets]);

  const torrentOption = useMemo(() => {
    const chartTextColor = colorScheme === "dark" ? "#d8e1f0" : "#546072";
    const chartLineColor = colorScheme === "dark" ? "rgba(216,225,240,0.14)" : "rgba(84,96,114,0.14)";
    const chartTooltipBackground = colorScheme === "dark" ? "rgba(23,29,39,0.96)" : "rgba(255,255,255,0.96)";
    const chartPalette = colorScheme === "dark"
      ? ["#6cb6ff", "#ff9233", "#59c9a5", "#d2a8ff", "#f2cc60", "#ff7b72"]
      : ["#2f6fed", "#ff7a00", "#18a374", "#8b5cf6", "#d97706", "#dc2626"];
    const points = torrentBuckets.slice(-180);
    const topSources = torrentSummary.sourceRows.slice(0, 6).map((item) => ({ key: item.source, label: item.name }));
    const buckets = Array.from(new Set(points.map((item) => item.bucket))).sort();
    return {
      color: chartPalette,
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartLineColor,
        textStyle: { color: chartTextColor }
      },
      legend: { textStyle: { color: chartTextColor } },
      grid: { left: 34, right: 16, top: 40, bottom: 28 },
      xAxis: {
        type: "category",
        data: buckets.map((item) => item.slice(5, 16).replace("T", " ")),
        axisLabel: { color: chartTextColor },
        axisLine: { lineStyle: { color: chartLineColor } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: chartTextColor },
        splitLine: { lineStyle: { color: chartLineColor } }
      },
      series: topSources.map((source) => ({
        name: source.label,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: buckets.map((bucket) =>
          points
            .filter((item) => item.bucket === bucket && item.source === source.key)
            .reduce((sum, item) => sum + item.count, 0)
        )
      }))
    };
  }, [colorScheme, torrentBuckets, torrentSummary.sourceRows]);

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
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>{t("monitor.title")}</Title>
          <Text c="dimmed">{t("monitor.subtitle")}</Text>
        </div>
        <Group gap="sm" wrap="wrap">
          {lastUpdatedAt ? (
            <Text c="dimmed" size="sm">{t("monitor.lastUpdated")}: {new Date(lastUpdatedAt).toLocaleString()}</Text>
          ) : null}
          <Tooltip label={t("common.refresh")} withArrow>
            <ActionIcon variant="default" size="lg" onClick={() => void load()} aria-label={t("common.refresh")}>
              <RefreshCw size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("cards.health")}</Text>
          <Text fw={700} size="xl">{loading ? <Loader size="sm" /> : renderHealthStatus(health?.status)}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("cards.version")}</Text>
          <Text fw={700} size="xl">{version}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("monitor.workers")}</Text>
          <Text fw={700} size="xl">{workerSummary.started} / {workerSummary.enabled} / {workerSummary.total}</Text>
          <Text c="dimmed" size="xs">{t("monitor.startedEnabledTotal")}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("monitor.checks")}</Text>
          <Text fw={700} size="xl">{checkSummary.down} / {checkSummary.total}</Text>
          <Text c="dimmed" size="xs">{t("monitor.downTotal")}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("monitor.totalQueueJobs")}</Text>
          <Text fw={700} size="xl">{queueSummary.total}</Text>
          <Text c="dimmed" size="xs">{t("monitor.activeQueues")}: {queueSummary.activeQueues}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("monitor.totalTorrentEvents")}</Text>
          <Text fw={700} size="xl">{torrentSummary.total}</Text>
          <Text c="dimmed" size="xs">{t("monitor.updatedTorrents")}: {torrentSummary.updated} · {t("monitor.newTorrents")}: {torrentSummary.created}</Text>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.queueMetrics")}</Text>
          <ECharts option={queueOption} className="monitor-chart" />
        </Card>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.torrentMetrics")}</Text>
          <ECharts option={torrentOption} className="monitor-chart" />
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card className="glass-card" withBorder>
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Text fw={600}>{t("monitor.statusBreakdown")}</Text>
            <Text c="dimmed" size="sm">{t("monitor.activeQueues")}: {queueSummary.activeQueues} · {t("monitor.latencyBuckets")}: {queueSummary.latencyBuckets}</Text>
          </Group>
          <ScrollArea offsetScrollbars>
            <Table striped withTableBorder miw={420}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("monitor.table.status")}</Table.Th>
                  <Table.Th>{t("common.total")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {queueSummary.statusRows.length > 0 ? queueSummary.statusRows.map((row) => (
                  <Table.Tr key={row.status}>
                    <Table.Td>
                      <Badge color={queueStatusColor(row.status)}>{row.status}</Badge>
                    </Table.Td>
                    <Table.Td>{row.count}</Table.Td>
                  </Table.Tr>
                )) : (
                  <Table.Tr>
                    <Table.Td colSpan={2}>
                      <Text c="dimmed" size="sm">{t("monitor.empty")}</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>

        <Card className="glass-card" withBorder>
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Text fw={600}>{t("monitor.sourcesBreakdown")}</Text>
            <Text c="dimmed" size="sm">{t("monitor.activeSources")}: {torrentSummary.activeSources}</Text>
          </Group>
          <ScrollArea offsetScrollbars>
            <Table striped withTableBorder miw={420}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("monitor.table.source")}</Table.Th>
                  <Table.Th>{t("common.total")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {torrentSummary.sourceRows.length > 0 ? torrentSummary.sourceRows.slice(0, 12).map((row) => (
                  <Table.Tr key={row.source}>
                    <Table.Td>{row.name}</Table.Td>
                    <Table.Td>{row.count}</Table.Td>
                  </Table.Tr>
                )) : (
                  <Table.Tr>
                    <Table.Td colSpan={2}>
                      <Text c="dimmed" size="sm">{t("monitor.empty")}</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.checks")}</Text>
          <ScrollArea offsetScrollbars>
            <Table striped withTableBorder miw={620}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("monitor.table.key")}</Table.Th>
                  <Table.Th>{t("monitor.table.status")}</Table.Th>
                  <Table.Th>{t("monitor.table.timestamp")}</Table.Th>
                  <Table.Th>{t("monitor.table.error")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(health?.checks || []).map((check) => (
                  <Table.Tr key={check.key}>
                    <Table.Td>{check.key}</Table.Td>
                    <Table.Td>
                      <Badge color={check.status === "up" ? "green" : check.status === "down" ? "red" : "yellow"}>
                        {renderHealthStatus(check.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{new Date(check.timestamp).toLocaleString()}</Table.Td>
                    <Table.Td>
                      <Text c={check.error ? "red" : "dimmed"} size="sm">{check.error || "-"}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>

        <Card className="glass-card" withBorder>
          <Group gap={6} mb="sm">
            <Activity size={16} />
            <Text fw={600}>{t("monitor.workers")}</Text>
          </Group>
          <ScrollArea offsetScrollbars>
            <Table striped withTableBorder miw={520}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("monitor.table.key")}</Table.Th>
                  <Table.Th>{t("monitor.table.enabled")}</Table.Th>
                  <Table.Th>{t("monitor.table.started")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {workers.map((worker) => (
                  <Table.Tr key={worker.key}>
                    <Table.Td>{worker.key}</Table.Td>
                    <Table.Td>
                      <Badge color={worker.enabled ? "blue" : "gray"}>
                        {worker.enabled ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={worker.started ? "green" : "gray"}>
                        {worker.started ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Activity, RefreshCw } from "lucide-react";
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
      workers: Array<{ key: string; started: boolean }>;
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
        status: string;
        createdAtBucket: string;
        count: number;
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
        count: number;
      }>;
    };
  };
};

export function MonitorPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse["health"] | null>(null);
  const [workers, setWorkers] = useState<HealthResponse["workers"]["listAll"]["workers"]>([]);
  const [version, setVersion] = useState("-");
  const [queueBuckets, setQueueBuckets] = useState<QueueMetricsResponse["queue"]["metrics"]["buckets"]>([]);
  const [torrentBuckets, setTorrentBuckets] = useState<TorrentMetricsResponse["torrent"]["metrics"]["buckets"]>([]);

  const renderHealthStatus = useCallback(
    (status?: string | null) => {
      if (!status) return "-";
      const key = `monitor.statusValues.${status}`;
      const translated = t(key);
      return translated === key ? status : translated;
    },
    [t]
  );

  const load = useCallback(async () => {
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
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queueOption = useMemo(() => {
    const points = queueBuckets.slice(-180);
    const statuses = Array.from(new Set(points.map((item) => item.status)));
    const buckets = Array.from(new Set(points.map((item) => item.createdAtBucket))).sort();
    return {
      tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#d6e4ff" } },
      grid: { left: 34, right: 16, top: 40, bottom: 28 },
      xAxis: { type: "category", data: buckets.map((item) => item.slice(11, 16)) },
      yAxis: { type: "value" },
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
  }, [queueBuckets]);

  const torrentOption = useMemo(() => {
    const points = torrentBuckets.slice(-180);
    const sources = Array.from(new Set(points.map((item) => item.source))).slice(0, 6);
    const buckets = Array.from(new Set(points.map((item) => item.bucket))).sort();
    return {
      tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#d6e4ff" } },
      grid: { left: 34, right: 16, top: 40, bottom: 28 },
      xAxis: { type: "category", data: buckets.map((item) => item.slice(11, 16)) },
      yAxis: { type: "value" },
      series: sources.map((source) => ({
        name: source,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: buckets.map((bucket) =>
          points
            .filter((item) => item.bucket === bucket && item.source === source)
            .reduce((sum, item) => sum + item.count, 0)
        )
      }))
    };
  }, [torrentBuckets]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("monitor.title")}</Title>
          <Text c="dimmed">{t("monitor.subtitle")}</Text>
        </div>
        <Button leftSection={<RefreshCw size={16} />} variant="default" onClick={() => void load()}>
          {t("common.refresh")}
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 4 }}>
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
          <Text fw={700} size="xl">{workers.length}</Text>
        </Card>
        <Card className="glass-card" withBorder>
          <Text c="dimmed" size="sm">{t("monitor.checks")}</Text>
          <Text fw={700} size="xl">{health?.checks.length || 0}</Text>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.queueMetrics")}</Text>
          <ECharts option={queueOption} style={{ height: 280 }} />
        </Card>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.torrentMetrics")}</Text>
          <ECharts option={torrentOption} style={{ height: 280 }} />
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card className="glass-card" withBorder>
          <Text fw={600} mb="sm">{t("monitor.checks")}</Text>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("monitor.table.key")}</Table.Th>
                <Table.Th>{t("monitor.table.status")}</Table.Th>
                <Table.Th>{t("monitor.table.timestamp")}</Table.Th>
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
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>

        <Card className="glass-card" withBorder>
          <Group gap={6} mb="sm">
            <Activity size={16} />
            <Text fw={600}>{t("monitor.workers")}</Text>
          </Group>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("monitor.table.key")}</Table.Th>
                <Table.Th>{t("monitor.table.started")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {workers.map((worker) => (
                <Table.Tr key={worker.key}>
                  <Table.Td>{worker.key}</Table.Td>
                  <Table.Td>
                    <Badge color={worker.started ? "green" : "gray"}>
                      {worker.started ? t("common.yes") : t("common.no")}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

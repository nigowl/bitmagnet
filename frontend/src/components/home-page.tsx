"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Clapperboard, Flame, RefreshCw } from "lucide-react";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY, TORRENT_METRICS_QUERY } from "@/lib/graphql";
import { useI18n } from "@/languages/provider";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type TorrentListItem = {
  infoHash: string;
  title: string;
  seeders?: number | null;
  leechers?: number | null;
  contentType?: string | null;
  torrent: {
    size: number;
    sources: Array<{ key: string; name: string }>;
  };
};

type SearchResponse = {
  torrentContent: {
    search: {
      totalCount: number;
      items: TorrentListItem[];
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

function formatBytes(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function HomePage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<TorrentListItem[]>([]);
  const [hottest, setHottest] = useState<TorrentListItem[]>([]);
  const [latestTotal, setLatestTotal] = useState(0);
  const [metricsBuckets, setMetricsBuckets] = useState<TorrentMetricsResponse["torrent"]["metrics"]["buckets"]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [latestResp, hotResp, metricsResp] = await Promise.all([
        graphqlRequest<SearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
          input: {
            limit: 12,
            page: 1,
            totalCount: true,
            orderBy: [{ field: "published_at", descending: true }]
          }
        }),
        graphqlRequest<SearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
          input: {
            limit: 12,
            page: 1,
            totalCount: true,
            orderBy: [{ field: "seeders", descending: true }]
          }
        }),
        graphqlRequest<TorrentMetricsResponse>(TORRENT_METRICS_QUERY, {
          input: { bucketDuration: "hour", startTime }
        })
      ]);

      setLatest(latestResp.torrentContent.search.items || []);
      setLatestTotal(latestResp.torrentContent.search.totalCount || 0);
      setHottest(hotResp.torrentContent.search.items || []);
      setMetricsBuckets(metricsResp.torrent.metrics.buckets || []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metricsOption = useMemo(() => {
    const points = metricsBuckets.slice(-160);
    const sources = Array.from(new Set(points.map((item) => item.source))).slice(0, 5);
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
  }, [metricsBuckets]);

  return (
    <Stack gap="md">
      <Card className="glass-card glass-strong" withBorder>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>{t("home.title")}</Title>
            <Text c="dimmed">{t("home.subtitle")}</Text>
            <Group gap="xs">
              <Badge variant="light">{t("home.latestCount")}: {latestTotal}</Badge>
              <Badge variant="light" color="orange">{t("home.hot")}</Badge>
            </Group>
          </Stack>
          <Group>
            <Button renderRoot={(props) => <Link href="/torrents" {...props} />} variant="light">
              {t("home.gotoTorrents")}
            </Button>
            <Button renderRoot={(props) => <Link href="/media" {...props} />} leftSection={<Clapperboard size={14} />} variant="light">
              {t("home.gotoMedia")}
            </Button>
            <Button leftSection={<RefreshCw size={14} />} variant="default" onClick={() => void load()}>
              {t("common.refresh")}
            </Button>
          </Group>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Text fw={600} mb="sm">
          {t("home.updateTrend")}
        </Text>
        <ECharts option={metricsOption} style={{ height: 290 }} />
      </Card>

      <Stack>
        <Card className="glass-card" withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>{t("home.latest")}</Text>
            <Badge variant="light">{latest.length}</Badge>
          </Group>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("home.name")}</Table.Th>
                  <Table.Th>{t("home.type")}</Table.Th>
                  <Table.Th>{t("home.size")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {latest.map((item) => (
                  <Table.Tr key={item.infoHash}>
                    <Table.Td>
                      <Link href={`/torrents/${item.infoHash}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <Text lineClamp={1} title={item.title} style={{ maxWidth: "min(56vw, 620px)" }}>
                          {item.title}
                        </Text>
                      </Link>
                    </Table.Td>
                    <Table.Td>{item.contentType ? t(`contentTypes.${item.contentType}`) : "-"}</Table.Td>
                    <Table.Td>{formatBytes(item.torrent.size)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        <Card className="glass-card" withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>{t("home.hottest")}</Text>
            <Badge variant="light" color="orange" leftSection={<Flame size={12} />}>
              {hottest.length}
            </Badge>
          </Group>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("home.name")}</Table.Th>
                  <Table.Th>{t("home.seeders")}</Table.Th>
                  <Table.Th>{t("home.leechers")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {hottest.map((item) => (
                  <Table.Tr key={item.infoHash}>
                    <Table.Td>
                      <Link href={`/torrents/${item.infoHash}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <Text lineClamp={1} title={item.title} style={{ maxWidth: "min(56vw, 620px)" }}>
                          {item.title}
                        </Text>
                      </Link>
                    </Table.Td>
                    <Table.Td>{item.seeders ?? "-"}</Table.Td>
                    <Table.Td>{item.leechers ?? "-"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Stack>
    </Stack>
  );
}

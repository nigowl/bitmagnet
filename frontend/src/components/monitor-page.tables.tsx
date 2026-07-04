"use client";

import { Badge, Card, Group, ScrollArea, Table, Text } from "@mantine/core";
import { Activity } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";

type Translate = (key: string) => string;

type QueueStatusRow = {
  status: string;
  count: number;
};

type TorrentSourceRow = {
  source: string;
  name: string;
  count: number;
};

type HealthCheck = {
  key: string;
  status: string;
  timestamp: string;
  error?: string | null;
};

type WorkerInfo = {
  key: string;
  enabled: boolean;
  started: boolean;
};

export function MonitorQueueStatusCard({
  t,
  activeQueues,
  latencyBuckets,
  rows,
  queueStatusColor
}: {
  t: Translate;
  activeQueues: number;
  latencyBuckets: number;
  rows: QueueStatusRow[];
  queueStatusColor: (status: string) => string;
}) {
  return (
    <Card className="glass-card" withBorder>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Text fw={600}>{t("monitor.statusBreakdown")}</Text>
        <Text c="dimmed" size="sm">
          {t("monitor.activeQueues")}: {activeQueues} · {t("monitor.latencyBuckets")}: {latencyBuckets}
        </Text>
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
            {rows.length > 0 ? rows.map((row) => (
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
  );
}

export function MonitorTorrentSourcesCard({
  t,
  activeSources,
  rows
}: {
  t: Translate;
  activeSources: number;
  rows: TorrentSourceRow[];
}) {
  return (
    <Card className="glass-card" withBorder>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Text fw={600}>{t("monitor.sourcesBreakdown")}</Text>
        <Text c="dimmed" size="sm">{t("monitor.activeSources")}: {activeSources}</Text>
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
            {rows.length > 0 ? rows.slice(0, 12).map((row) => (
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
  );
}

export function MonitorHealthChecksCard({
  t,
  checks,
  healthStatusColor,
  renderHealthStatus,
  healthCheckInfo,
  healthCheckInfoColor
}: {
  t: Translate;
  checks: HealthCheck[];
  healthStatusColor: (status?: string | null) => string;
  renderHealthStatus: (status?: string | null) => string;
  healthCheckInfo: (check: HealthCheck) => string;
  healthCheckInfoColor: (check: HealthCheck) => string;
}) {
  return (
    <Card className="glass-card" withBorder>
      <Text fw={600} mb="sm">{t("monitor.checks")}</Text>
      <ScrollArea offsetScrollbars>
        <Table striped withTableBorder miw={620}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("monitor.table.key")}</Table.Th>
              <Table.Th>{t("monitor.table.status")}</Table.Th>
              <Table.Th>{t("monitor.table.timestamp")}</Table.Th>
              <Table.Th>{t("monitor.table.info")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {checks.map((check) => (
              <Table.Tr key={check.key}>
                <Table.Td>{check.key}</Table.Td>
                <Table.Td>
                  <Badge color={healthStatusColor(check.status)}>
                    {renderHealthStatus(check.status)}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDateTime(check.timestamp)}</Table.Td>
                <Table.Td>
                  <Text c={healthCheckInfoColor(check)} size="sm">{healthCheckInfo(check)}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
}

export function MonitorWorkersCard({
  t,
  workers
}: {
  t: Translate;
  workers: WorkerInfo[];
}) {
  return (
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
                  <Badge color={worker.enabled ? "blue" : "slate"}>
                    {worker.enabled ? t("common.yes") : t("common.no")}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={worker.started ? "green" : "slate"}>
                    {worker.started ? t("common.yes") : t("common.no")}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
}

"use client";

import { Fragment } from "react";
import { Badge, Card, Group, Loader, ScrollArea, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { formatDateTime } from "@/lib/datetime";
import type { QueueJob } from "./queue-page.helpers";

type QueueJobsTableProps = {
  t: (key: string) => string;
  loading: boolean;
  jobs: QueueJob[];
  expandedJobId: string | null;
  formatPayload: (payload: string) => string;
  normalizeQueueLabel: (queueName: string, fallbackLabel?: string) => string;
  renderStatusLabel: (status: string) => string;
  onToggleExpandedJob: (jobId: string) => void;
};

export function QueueJobsTable({
  t,
  loading,
  jobs,
  expandedJobId,
  formatPayload,
  normalizeQueueLabel,
  renderStatusLabel,
  onToggleExpandedJob
}: QueueJobsTableProps) {
  return (
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
          ) : jobs.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed" ta="center" py="md">
                  {t("queue.noJobs")}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            jobs.map((job) => (
              <Fragment key={job.id}>
                <Table.Tr style={{ cursor: "pointer" }} onClick={() => onToggleExpandedJob(job.id)}>
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
                  <Table.Td>{formatDateTime(job.createdAt)}</Table.Td>
                  <Table.Td>{formatDateTime(job.ranAt)}</Table.Td>
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
                              <Text size="sm">{formatDateTime(job.runAfter)}</Text>
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
  );
}

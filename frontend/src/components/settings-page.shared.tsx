"use client";

import type { ReactNode } from "react";
import { ActionIcon, Badge, Card, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { Pencil, Trash2 } from "lucide-react";
import type { PluginTestResult, SubtitleTemplate } from "./settings-page.types";

type SettingsResultLine = {
  label?: ReactNode;
  value: ReactNode;
  monospace?: boolean;
};

type SettingsResultCardProps = {
  success: boolean;
  successLabel: string;
  failureLabel: string;
  latencyLabel: string;
  latencyMs: number;
  messageLabel: string;
  message: string;
  lines?: SettingsResultLine[];
  children?: ReactNode;
};

export function SettingsResultCard({
  success,
  successLabel,
  failureLabel,
  latencyLabel,
  latencyMs,
  messageLabel,
  message,
  lines = [],
  children
}: SettingsResultCardProps) {
  return (
    <Card withBorder radius="md" p="sm">
      <Stack gap={6}>
        <Group gap={8}>
          <Badge color={success ? "green" : "yellow"} variant="light">
            {success ? successLabel : failureLabel}
          </Badge>
          <Text size="sm">{latencyLabel}: {latencyMs}ms</Text>
        </Group>
        <Text size="sm">{messageLabel}: {message || "-"}</Text>
        {lines.map((line, index) => (
          <Text key={index} size="sm" ff={line.monospace ? "monospace" : undefined}>
            {line.label ? (
              <>
                {line.label}: {line.value}
              </>
            ) : (
              line.value
            )}
          </Text>
        ))}
        {children}
      </Stack>
    </Card>
  );
}

type SettingsPluginResultPreviewProps = {
  result: PluginTestResult | null;
};

export function SettingsPluginResultPreview({ result }: SettingsPluginResultPreviewProps) {
  if (!result) return null;
  return (
    <ScrollArea className="settings-plugin-test-scroll" h={320} type="auto" scrollbarSize={8}>
      <pre className="settings-plugin-test-content">{JSON.stringify(result, null, 2)}</pre>
    </ScrollArea>
  );
}

type SubtitleTemplateTableProps = {
  templates: SubtitleTemplate[];
  emptyLabel: string;
  nameLabel: string;
  urlLabel: string;
  enabledLabel: string;
  actionsLabel: string;
  enabledYesLabel: string;
  enabledNoLabel: string;
  editLabel: string;
  deleteLabel: string;
  onEdit: (template: SubtitleTemplate) => void;
  onDelete: (templateId: string) => void;
  deleting: Record<string, boolean>;
};

export function SubtitleTemplateTable({
  templates,
  emptyLabel,
  nameLabel,
  urlLabel,
  enabledLabel,
  actionsLabel,
  enabledYesLabel,
  enabledNoLabel,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
  deleting
}: SubtitleTemplateTableProps) {
  if (templates.length === 0) {
    return <Text size="sm" c="dimmed">{emptyLabel}</Text>;
  }

  return (
    <Card withBorder radius="lg" className="settings-subtitle-template-item">
      <ScrollArea type="auto" scrollbarSize={8}>
        <Table striped withTableBorder highlightOnHover miw={760}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{nameLabel}</Table.Th>
              <Table.Th>{urlLabel}</Table.Th>
              <Table.Th>{enabledLabel}</Table.Th>
              <Table.Th>{actionsLabel}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {templates.map((template) => (
              <Table.Tr key={template.id}>
                <Table.Td>{template.name || "-"}</Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1} title={template.urlTemplate}>
                    {template.urlTemplate}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={template.enabled ? "green" : "slate"} variant="light">
                    {template.enabled ? enabledYesLabel : enabledNoLabel}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <ActionIcon
                      className="app-icon-btn"
                      variant="default"
                      size={30}
                      aria-label={editLabel}
                      onClick={() => onEdit(template)}
                    >
                      <Pencil size={14} />
                    </ActionIcon>
                    <ActionIcon
                      className="app-icon-btn"
                      color="red"
                      variant="light"
                      size={30}
                      loading={Boolean(deleting[template.id])}
                      aria-label={deleteLabel}
                      onClick={() => onDelete(template.id)}
                    >
                      <Trash2 size={14} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
}

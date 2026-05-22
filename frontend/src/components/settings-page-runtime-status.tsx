"use client";

import type { ReactNode } from "react";
import { ActionIcon, Badge, Button, Card, Group, ScrollArea, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { RotateCcw } from "lucide-react";
import type { RuntimeWorkerDetail } from "./settings-page.logic";
import type { RuntimeStatus } from "./settings-page.types";
import type { TFunction } from "./settings-page-tabs";

type SettingsRuntimeStatusPanelProps = {
  t: TFunction;
  runtimeStatus: RuntimeStatus | null;
  runtimeStatusLoading: boolean;
  workerRestarting: Record<string, boolean>;
  onReloadRuntimeStatus: () => void;
  onRestartWorker: (workerKey: string) => void;
  formatRuntimeCheckedAt: (value: string) => string;
  renderRuntimeValue: (value: string) => ReactNode;
  workerDetails: (key: string) => RuntimeWorkerDetail;
};

export function SettingsRuntimeStatusPanel({
  t,
  runtimeStatus,
  runtimeStatusLoading,
  workerRestarting,
  onReloadRuntimeStatus,
  onRestartWorker,
  formatRuntimeCheckedAt,
  renderRuntimeValue,
  workerDetails
}: SettingsRuntimeStatusPanelProps) {
  return (
    <Card className="settings-section-block" radius="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Text c="dimmed" size="sm">{t("settings.runtimeStatusHint")}</Text>
          <Button size="xs" variant="default" loading={runtimeStatusLoading} onClick={onReloadRuntimeStatus}>
            {t("common.refresh")}
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          {t("settings.runtimeStatusCheckedAt")}: {formatRuntimeCheckedAt(runtimeStatus?.checkedAt || "")}
        </Text>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Stack gap={8}>
            <Text fw={600} size="sm">{t("settings.runtimeStatusWorkersTitle")}</Text>
            {runtimeStatus?.workers?.length ? (
              <ScrollArea.Autosize mah={280} type="auto" scrollbarSize={8}>
                <Stack gap={6} className="settings-runtime-worker-list">
                  {runtimeStatus.workers.map((worker) => (
                    <Card key={worker.key} className="settings-runtime-worker-item" p="xs" radius="md">
                      <Stack gap={6}>
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Stack gap={1}>
                            <Text className="settings-runtime-worker-key">{worker.key}</Text>
                            <Text size="xs" c="dimmed">{workerDetails(worker.key).kind}</Text>
                          </Stack>
                          <Tooltip label={t("settings.workerRestart")} withArrow>
                            <ActionIcon
                              className="app-icon-btn spin-on-active"
                              data-spinning={workerRestarting[worker.key] ? "true" : "false"}
                              variant="subtle"
                              color="slate"
                              size="sm"
                              loading={Boolean(workerRestarting[worker.key])}
                              aria-label={t("settings.workerRestart")}
                              onClick={() => onRestartWorker(worker.key)}
                            >
                              <RotateCcw size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                        <Group gap={6} wrap="wrap">
                          <Badge size="xs" variant="light" color={worker.enabled ? "teal" : "slate"}>
                            {t("settings.runtimeStatusEnabledLabel")}: {worker.enabled ? t("common.yes") : t("common.no")}
                          </Badge>
                          <Badge size="xs" variant="light" color={worker.started ? "green" : "yellow"}>
                            {t("settings.runtimeStatusStartedLabel")}: {worker.started ? t("common.yes") : t("common.no")}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {t("settings.workerConfigScope")}: <span className="settings-runtime-worker-scope">{workerDetails(worker.key).scope}</span>
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1} title={workerDetails(worker.key).desc}>
                          {workerDetails(worker.key).desc}
                        </Text>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            ) : (
              <Text size="sm" c="dimmed">{t("settings.runtimeStatusNoWorkers")}</Text>
            )}
          </Stack>

          <Stack gap={8}>
            <Text fw={600} size="sm">{t("settings.runtimeStatusSettingsTitle")}</Text>
            {runtimeStatus?.settings?.length ? (
              <ScrollArea.Autosize mah={280} type="auto" scrollbarSize={8}>
                <Stack gap={6} className="settings-runtime-key-list">
                  {runtimeStatus.settings.map((item) => (
                    <div key={item.key} className="settings-runtime-key-row">
                      <div className="settings-runtime-key-head">
                        <Text className="settings-runtime-key">{item.key}</Text>
                        <Text className={`settings-runtime-key-source ${item.source === "runtime" ? "is-runtime" : "is-default"}`}>
                          ({item.source === "runtime" ? t("settings.runtimeStatusSourceRuntime") : t("settings.runtimeStatusSourceDefault")})
                        </Text>
                      </div>
                      {renderRuntimeValue(item.value === "" ? t("settings.runtimeStatusEmptyValue") : item.value)}
                    </div>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            ) : (
              <Text size="sm" c="dimmed">{t("settings.runtimeStatusNoSettings")}</Text>
            )}
          </Stack>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}

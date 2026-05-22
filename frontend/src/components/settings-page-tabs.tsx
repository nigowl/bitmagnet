"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Accordion,
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title
} from "@mantine/core";
import type { PerformancePresetKey } from "./settings-page.defaults";
import type { RuntimeWorkerDetail } from "./settings-page.logic";
import { SettingsRuntimeStatusPanel } from "./settings-page-runtime-status";
import type {
  RuntimeStatus,
  SystemSettings
} from "./settings-page.types";

export type TFunction = (key: string) => string;

export type SettingsPageStateSetter<T> = Dispatch<SetStateAction<T>>;

type SettingsPerformanceTabProps = {
  t: TFunction;
  settings: SystemSettings;
  runtimeStatus: RuntimeStatus | null;
  runtimeStatusLoading: boolean;
  workerRestarting: Record<string, boolean>;
  onReloadRuntimeStatus: () => void;
  onRestartWorker: (workerKey: string) => void;
  onApplyPerformancePreset: (preset: PerformancePresetKey) => void;
  onUpdateDHTPerformance: (updates: Partial<SystemSettings["performance"]["dht"]>) => void;
  onUpdateMediaPerformance: (updates: Partial<SystemSettings["performance"]["media"]>) => void;
  onUpdateQueuePerformance: (updates: Partial<SystemSettings["performance"]["queue"]>) => void;
  renderPerformanceLabel: (label: string, impact: string) => ReactNode;
  formatRuntimeCheckedAt: (value: string) => string;
  renderRuntimeValue: (value: string) => ReactNode;
  workerDetails: (key: string) => RuntimeWorkerDetail;
};

export function SettingsPerformanceTab({
  t,
  settings,
  runtimeStatus,
  runtimeStatusLoading,
  workerRestarting,
  onReloadRuntimeStatus,
  onRestartWorker,
  onApplyPerformancePreset,
  onUpdateDHTPerformance,
  onUpdateMediaPerformance,
  onUpdateQueuePerformance,
  renderPerformanceLabel,
  formatRuntimeCheckedAt,
  renderRuntimeValue,
  workerDetails
}: SettingsPerformanceTabProps) {
  const dhtWeekdayOptions = [
    { value: "1", label: t("settings.weekdays.mon") },
    { value: "2", label: t("settings.weekdays.tue") },
    { value: "3", label: t("settings.weekdays.wed") },
    { value: "4", label: t("settings.weekdays.thu") },
    { value: "5", label: t("settings.weekdays.fri") },
    { value: "6", label: t("settings.weekdays.sat") },
    { value: "7", label: t("settings.weekdays.sun") }
  ];
  const dhtHourOptions = Array.from({ length: 25 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, "0")}:00`
  }));
  const dhtScheduleWeekdaysInvalid = settings.performance.dht.scheduleEnabled && settings.performance.dht.scheduleWeekdays.length === 0;
  const dhtScheduleHoursInvalid = settings.performance.dht.scheduleEnabled && settings.performance.dht.scheduleStartHour >= settings.performance.dht.scheduleEndHour;

  return (
    <Tabs.Panel value="performance" pt="md">
      <Stack gap="md">
        <Title order={4}>{t("settings.performanceTitle")}</Title>
        <Text c="dimmed" size="sm">{t("settings.performanceHint")}</Text>

        <Accordion
          className="settings-sections-accordion"
          variant="separated"
          radius="lg"
          multiple
          defaultValue={["perf-runtime", "perf-dht", "perf-media", "perf-queue"]}
        >
          <Accordion.Item value="perf-runtime">
            <Accordion.Control>{t("settings.runtimeStatusTitle")}</Accordion.Control>
            <Accordion.Panel>
              <SettingsRuntimeStatusPanel
                t={t}
                runtimeStatus={runtimeStatus}
                runtimeStatusLoading={runtimeStatusLoading}
                workerRestarting={workerRestarting}
                onReloadRuntimeStatus={onReloadRuntimeStatus}
                onRestartWorker={onRestartWorker}
                formatRuntimeCheckedAt={formatRuntimeCheckedAt}
                renderRuntimeValue={renderRuntimeValue}
                workerDetails={workerDetails}
              />
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="perf-dht">
            <Accordion.Control>{t("settings.performanceDhtTitle")}</Accordion.Control>
            <Accordion.Panel>
              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Text c="dimmed" size="sm">{t("settings.performancePresetHint")}</Text>
                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    {(["resource", "realtime", "throughput"] as PerformancePresetKey[]).map((preset) => (
                      <Card key={preset} className="settings-preset-card" radius="md" p="sm">
                        <Stack gap={8}>
                          <Text fw={700}>{t(`settings.performancePresetOptions.${preset}`)}</Text>
                          <Text size="sm" c="dimmed">{t(`settings.performancePresetDescriptions.${preset}`)}</Text>
                          <Button size="xs" variant="light" onClick={() => onApplyPerformancePreset(preset)}>
                            {t("settings.performancePresetApply")}
                          </Button>
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>
                  <div className="settings-schedule-panel">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                        <Stack gap={4}>
                          <Text fw={700}>{t("settings.dhtScheduleTitle")}</Text>
                          <Text size="sm" c="dimmed">{t("settings.dhtScheduleHint")}</Text>
                        </Stack>
                        <Switch
                          checked={settings.performance.dht.scheduleEnabled}
                          label={t("settings.dhtScheduleEnabled")}
                          onChange={(event) => onUpdateDHTPerformance({ scheduleEnabled: event.currentTarget.checked })}
                        />
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 3 }}>
                        <MultiSelect
                          label={renderPerformanceLabel(t("settings.dhtScheduleWeekdays"), t("settings.performanceImpact.dhtScheduleWeekdays"))}
                          data={dhtWeekdayOptions}
                          value={settings.performance.dht.scheduleWeekdays.map(String)}
                          disabled={!settings.performance.dht.scheduleEnabled}
                          error={dhtScheduleWeekdaysInvalid ? t("settings.dhtScheduleWeekdaysError") : undefined}
                          onChange={(value) => {
                            onUpdateDHTPerformance({
                              scheduleWeekdays: value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
                            });
                          }}
                        />
                        <Select
                          label={renderPerformanceLabel(t("settings.dhtScheduleStartHour"), t("settings.performanceImpact.dhtScheduleStartHour"))}
                          data={dhtHourOptions.slice(0, 24)}
                          value={String(settings.performance.dht.scheduleStartHour)}
                          disabled={!settings.performance.dht.scheduleEnabled}
                          onChange={(value) => {
                            const hour = Number(value);
                            if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
                              onUpdateDHTPerformance({ scheduleStartHour: hour });
                            }
                          }}
                        />
                        <Select
                          label={renderPerformanceLabel(t("settings.dhtScheduleEndHour"), t("settings.performanceImpact.dhtScheduleEndHour"))}
                          data={dhtHourOptions.slice(1)}
                          value={String(settings.performance.dht.scheduleEndHour)}
                          disabled={!settings.performance.dht.scheduleEnabled}
                          error={dhtScheduleHoursInvalid ? t("settings.dhtScheduleEndHourError") : undefined}
                          onChange={(value) => {
                            const hour = Number(value);
                            if (Number.isInteger(hour) && hour >= 1 && hour <= 24) {
                              onUpdateDHTPerformance({ scheduleEndHour: hour });
                            }
                          }}
                        />
                      </SimpleGrid>
                    </Stack>
                  </div>
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtScalingFactor"), t("settings.performanceImpact.dhtScalingFactor"))}
                      min={1}
                      max={200}
                      value={settings.performance.dht.scalingFactor}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ scalingFactor: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtReseedIntervalSeconds"), t("settings.performanceImpact.dhtReseedIntervalSeconds"))}
                      min={10}
                      max={3600}
                      value={settings.performance.dht.reseedIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ reseedIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtSaveFilesThreshold"), t("settings.performanceImpact.dhtSaveFilesThreshold"))}
                      min={1}
                      max={20000}
                      value={settings.performance.dht.saveFilesThreshold}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ saveFilesThreshold: value });
                        }
                      }}
                    />
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.dhtSavePieces"), t("settings.performanceImpact.dhtSavePieces"))}
                      </div>
                      <Switch
                        checked={settings.performance.dht.savePieces}
                        onChange={(event) => onUpdateDHTPerformance({ savePieces: event.currentTarget.checked })}
                      />
                    </Stack>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtRescrapeThresholdHours"), t("settings.performanceImpact.dhtRescrapeThresholdHours"))}
                      min={1}
                      max={24 * 365}
                      value={settings.performance.dht.rescrapeThresholdHours}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ rescrapeThresholdHours: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtStatusLogIntervalSeconds"), t("settings.performanceImpact.dhtStatusLogIntervalSeconds"))}
                      min={5}
                      max={3600}
                      value={settings.performance.dht.statusLogIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ statusLogIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtGetOldestNodesIntervalSeconds"), t("settings.performanceImpact.dhtGetOldestNodesIntervalSeconds"))}
                      min={1}
                      max={600}
                      value={settings.performance.dht.getOldestNodesIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ getOldestNodesIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtOldPeerThresholdMinutes"), t("settings.performanceImpact.dhtOldPeerThresholdMinutes"))}
                      min={1}
                      max={24 * 60}
                      value={settings.performance.dht.oldPeerThresholdMinutes}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateDHTPerformance({ oldPeerThresholdMinutes: value });
                        }
                      }}
                    />
                  </SimpleGrid>
                </Stack>
              </Card>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="perf-media">
            <Accordion.Control>{t("settings.performanceMediaTitle")}</Accordion.Control>
            <Accordion.Panel>
              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.mediaAutoCacheCover"), t("settings.performanceImpact.mediaAutoCacheCover"))}
                      </div>
                      <Switch
                        checked={settings.performance.media.autoCacheCover}
                        onChange={(event) => onUpdateMediaPerformance({ autoCacheCover: event.currentTarget.checked })}
                      />
                    </Stack>
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.mediaAutoFetchBilingual"), t("settings.performanceImpact.mediaAutoFetchBilingual"))}
                      </div>
                      <Switch
                        checked={settings.performance.media.autoFetchBilingual}
                        onChange={(event) => onUpdateMediaPerformance({ autoFetchBilingual: event.currentTarget.checked })}
                      />
                    </Stack>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.mediaWarmupTimeoutSeconds"), t("settings.performanceImpact.mediaWarmupTimeoutSeconds"))}
                      min={5}
                      max={7200}
                      value={settings.performance.media.warmupTimeoutSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateMediaPerformance({ warmupTimeoutSeconds: value });
                        }
                      }}
                    />
                  </SimpleGrid>
                </Stack>
              </Card>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="perf-queue">
            <Accordion.Control>{t("settings.performanceQueueTitle")}</Accordion.Control>
            <Accordion.Panel>
              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentConcurrency"), t("settings.performanceImpact.queueProcessTorrentConcurrency"))}
                      min={1}
                      max={128}
                      value={settings.performance.queue.processTorrentConcurrency}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentConcurrency: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentCheckIntervalSeconds"), t("settings.performanceImpact.queueProcessTorrentCheckIntervalSeconds"))}
                      min={1}
                      max={300}
                      value={settings.performance.queue.processTorrentCheckIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentCheckIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentTimeoutSeconds"), t("settings.performanceImpact.queueProcessTorrentTimeoutSeconds"))}
                      min={5}
                      max={7200}
                      value={settings.performance.queue.processTorrentTimeoutSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentTimeoutSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentBatchConcurrency"), t("settings.performanceImpact.queueProcessTorrentBatchConcurrency"))}
                      min={1}
                      max={128}
                      value={settings.performance.queue.processTorrentBatchConcurrency}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentBatchConcurrency: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentBatchCheckIntervalSeconds"), t("settings.performanceImpact.queueProcessTorrentBatchCheckIntervalSeconds"))}
                      min={1}
                      max={300}
                      value={settings.performance.queue.processTorrentBatchCheckIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentBatchCheckIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentBatchTimeoutSeconds"), t("settings.performanceImpact.queueProcessTorrentBatchTimeoutSeconds"))}
                      min={5}
                      max={7200}
                      value={settings.performance.queue.processTorrentBatchTimeoutSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ processTorrentBatchTimeoutSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueRefreshMediaMetadataConcurrency"), t("settings.performanceImpact.queueRefreshMediaMetadataConcurrency"))}
                      min={1}
                      max={128}
                      value={settings.performance.queue.refreshMediaMetadataConcurrency}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ refreshMediaMetadataConcurrency: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueRefreshMediaMetadataCheckIntervalSeconds"), t("settings.performanceImpact.queueRefreshMediaMetadataCheckIntervalSeconds"))}
                      min={1}
                      max={300}
                      value={settings.performance.queue.refreshMediaMetadataCheckIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ refreshMediaMetadataCheckIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueRefreshMediaMetadataTimeoutSeconds"), t("settings.performanceImpact.queueRefreshMediaMetadataTimeoutSeconds"))}
                      min={5}
                      max={7200}
                      value={settings.performance.queue.refreshMediaMetadataTimeoutSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ refreshMediaMetadataTimeoutSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueBackfillCoverCacheConcurrency"), t("settings.performanceImpact.queueBackfillCoverCacheConcurrency"))}
                      min={1}
                      max={128}
                      value={settings.performance.queue.backfillCoverCacheConcurrency}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ backfillCoverCacheConcurrency: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueBackfillCoverCacheCheckIntervalSeconds"), t("settings.performanceImpact.queueBackfillCoverCacheCheckIntervalSeconds"))}
                      min={1}
                      max={300}
                      value={settings.performance.queue.backfillCoverCacheCheckIntervalSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ backfillCoverCacheCheckIntervalSeconds: value });
                        }
                      }}
                    />
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueBackfillCoverCacheTimeoutSeconds"), t("settings.performanceImpact.queueBackfillCoverCacheTimeoutSeconds"))}
                      min={5}
                      max={7200}
                      value={settings.performance.queue.backfillCoverCacheTimeoutSeconds}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          onUpdateQueuePerformance({ backfillCoverCacheTimeoutSeconds: value });
                        }
                      }}
                    />
                  </SimpleGrid>
                </Stack>
              </Card>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Tabs.Panel>
  );
}

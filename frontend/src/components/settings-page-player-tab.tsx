"use client";

import { Accordion, Badge, Button, Card, Group, NumberInput, SimpleGrid, Stack, Switch, Tabs, TagsInput, Text, TextInput } from "@mantine/core";
import { RotateCcw } from "lucide-react";
import { SettingsResultCard } from "./settings-page.shared";
import type { FFmpegConnectivityResult, SystemSettings, DownloadMappingConnectivityResult, TransmissionConnectivityResult, TransmissionTaskStats } from "./settings-page.types";
import { formatGiBFromBytes, normalizeVideoFormatTags } from "./settings-page.helpers";

type TFunction = (key: string) => string;
type SettingsUpdater<T> = (updates: T) => void;
type SettingsFlagUpdater = (checked: boolean) => void;

function formatDownloadMappingMode(mode: string | undefined, t: TFunction): string {
  if (!mode) return "-";
  if (mode === "directory") return t("settings.playerDownloadMappingModeDirectory");
  return mode;
}

type SettingsPagePlayerTabProps = {
  t: TFunction;
  settings: SystemSettings;
  transmissionTesting: boolean;
  downloadMappingTesting: boolean;
  transmissionTestResult: TransmissionConnectivityResult | null;
  downloadMappingTestResult: DownloadMappingConnectivityResult | null;
  transmissionTaskStats: TransmissionTaskStats | null;
  ffmpegTesting: boolean;
  ffmpegTestResult: FFmpegConnectivityResult | null;
  onResetDefaults: () => void;
  onToggleEnabled: SettingsFlagUpdater;
  onUpdatePlayerSettings: SettingsUpdater<Partial<SystemSettings["player"]>>;
  onUpdateTransmissionSettings: SettingsUpdater<Partial<SystemSettings["player"]["transmission"]>>;
  onUpdateFfmpegSettings: SettingsUpdater<Partial<SystemSettings["player"]["ffmpeg"]>>;
  onTestTransmission: () => void;
  onTestDownloadMapping: () => void;
  onTestFfmpeg: () => void;
};

export function SettingsPagePlayerTab({
  t,
  settings,
  transmissionTesting,
  downloadMappingTesting,
  transmissionTestResult,
  downloadMappingTestResult,
  transmissionTaskStats,
  ffmpegTesting,
  ffmpegTestResult,
  onResetDefaults,
  onToggleEnabled,
  onUpdatePlayerSettings,
  onUpdateTransmissionSettings,
  onUpdateFfmpegSettings,
  onTestTransmission,
  onTestDownloadMapping,
  onTestFfmpeg
}: SettingsPagePlayerTabProps) {
  return (
    <Tabs.Panel value="player" pt="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={2}>
            <Text fw={700}>{t("settings.playerTitle")}</Text>
            <Text c="dimmed" size="sm">{t("settings.playerHint")}</Text>
          </Stack>
          <Button variant="default" size="xs" leftSection={<RotateCcw size={14} />} onClick={onResetDefaults}>
            {t("settings.playerResetDefaults")}
          </Button>
        </Group>
        <Card className="settings-section-block" radius="lg">
          <Switch
            label={t("settings.playerEnabled")}
            checked={settings.player.enabled}
            onChange={(event) => onToggleEnabled(event.currentTarget.checked)}
          />
        </Card>

        {settings.player.enabled ? (
          <Accordion
            className="settings-sections-accordion"
            variant="separated"
            radius="lg"
            multiple
            defaultValue={["player-policy", "player-transmission", "player-ffmpeg"]}
          >
            <Accordion.Item value="player-policy">
              <Accordion.Control>{t("settings.playerConnectionPolicyTitle")}</Accordion.Control>
              <Accordion.Panel>
                <Card className="settings-section-block" radius="lg">
                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                      <NumberInput
                        label={t("settings.playerMetadataTimeoutSeconds")}
                        min={5}
                        max={300}
                        value={settings.player.metadataTimeoutSeconds}
                        onChange={(value) => {
                          if (typeof value === "number" && Number.isFinite(value)) {
                            if (value > settings.player.hardTimeoutSeconds) {
                              onUpdatePlayerSettings({ metadataTimeoutSeconds: value, hardTimeoutSeconds: value });
                              return;
                            }
                            onUpdatePlayerSettings({ metadataTimeoutSeconds: value });
                          }
                        }}
                      />
                      <NumberInput
                        label={t("settings.playerHardTimeoutSeconds")}
                        min={Math.max(10, settings.player.metadataTimeoutSeconds)}
                        max={900}
                        value={settings.player.hardTimeoutSeconds}
                        onChange={(value) => {
                          if (typeof value === "number" && Number.isFinite(value)) {
                            onUpdatePlayerSettings({ hardTimeoutSeconds: value });
                          }
                        }}
                      />
                    </SimpleGrid>
                  </Stack>
                </Card>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="player-transmission">
              <Accordion.Control>{t("settings.playerTransmissionTitle")}</Accordion.Control>
              <Accordion.Panel>
                <Card className="settings-section-block" radius="lg">
                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">{t("settings.playerTransmissionHint")}</Text>
                    <Badge variant="light" color="blue">{t("settings.playerRequiredEnabled")}</Badge>
                    <Stack gap="sm" className="settings-toggle-panel">
                      <Group justify="flex-end" align="flex-start" wrap="wrap">
                        <Group gap="xs">
                          <Button variant="default" size="xs" loading={downloadMappingTesting} onClick={onTestDownloadMapping}>
                            {t("settings.playerDownloadMappingTestButton")}
                          </Button>
                          <Button variant="light" size="xs" loading={transmissionTesting} onClick={onTestTransmission}>
                            {t("settings.playerTransmissionTestButton")}
                          </Button>
                        </Group>
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <TextInput
                          label={t("settings.playerTransmissionUrl")}
                          value={settings.player.transmission.url}
                          onChange={(event) => {
                            onUpdateTransmissionSettings({ url: event.currentTarget.value });
                          }}
                        />
                        <NumberInput
                          label={t("settings.playerTransmissionTimeoutSeconds")}
                          min={2}
                          max={60}
                          value={settings.player.transmission.timeoutSeconds}
                          onChange={(value) => {
                            if (typeof value === "number" && Number.isFinite(value)) {
                              onUpdateTransmissionSettings({ timeoutSeconds: value });
                            }
                          }}
                        />
                        <TextInput
                          label={t("settings.playerTransmissionUsername")}
                          value={settings.player.transmission.username}
                          onChange={(event) => {
                            onUpdateTransmissionSettings({ username: event.currentTarget.value });
                          }}
                        />
                        <TextInput
                          label={t("settings.playerTransmissionPassword")}
                          type="password"
                          value={settings.player.transmission.password}
                          onChange={(event) => {
                            onUpdateTransmissionSettings({ password: event.currentTarget.value });
                          }}
                        />
                      </SimpleGrid>
                      <TagsInput
                        label={t("settings.playerTransmissionDownloadVideoFormats")}
                        description={t("settings.playerTransmissionDownloadVideoFormatsHint")}
                        value={settings.player.transmission.downloadVideoFormats}
                        onChange={(value) => {
                          onUpdateTransmissionSettings({ downloadVideoFormats: normalizeVideoFormatTags(value) });
                        }}
                        clearable
                        splitChars={[",", " ", ";", "\n", "\t"]}
                        placeholder=".mp4, .mkv, .webm"
                      />
                      <TextInput
                        label={t("settings.playerTransmissionLocalDownloadDir")}
                        description={t("settings.playerTransmissionLocalDownloadDirHint")}
                        value={settings.player.transmission.downloadMappingDirectory}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          onUpdateTransmissionSettings({
                            downloadMappingDirectory: value,
                            localDownloadDir: value
                          });
                        }}
                      />
                      <Switch
                        label={t("settings.playerTransmissionInsecureTls")}
                        checked={settings.player.transmission.insecureTls}
                        onChange={(event) => {
                          onUpdateTransmissionSettings({ insecureTls: event.currentTarget.checked });
                        }}
                      />
                      <Switch
                        label={t("settings.playerTransmissionSequentialDownload")}
                        checked={settings.player.transmission.sequentialDownload}
                        onChange={(event) => {
                          onUpdateTransmissionSettings({ sequentialDownload: event.currentTarget.checked });
                        }}
                      />
                      <Switch
                        label={t("settings.playerTransmissionCacheQueueEnabled")}
                        checked={settings.player.transmission.cacheQueueEnabled}
                        onChange={(event) => {
                          onUpdateTransmissionSettings({ cacheQueueEnabled: event.currentTarget.checked });
                        }}
                      />
                      {settings.player.transmission.cacheQueueEnabled ? (
                        <SimpleGrid className="settings-nested-options" cols={{ base: 1, md: 2 }}>
                          <NumberInput
                            label={t("settings.playerTransmissionCacheQueueMaxActive")}
                            min={1}
                            max={20}
                            value={settings.player.transmission.cacheQueueMaxActive}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                onUpdateTransmissionSettings({ cacheQueueMaxActive: value });
                              }
                            }}
                          />
                          <NumberInput
                            label={t("settings.playerTransmissionCacheQueueCheckIntervalSeconds")}
                            min={3}
                            max={300}
                            value={settings.player.transmission.cacheQueueCheckIntervalSeconds}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                onUpdateTransmissionSettings({ cacheQueueCheckIntervalSeconds: value });
                              }
                            }}
                          />
                        </SimpleGrid>
                      ) : null}
                      <Switch
                        label={t("settings.playerTransmissionAutoCleanupEnabled")}
                        checked={settings.player.transmission.autoCleanupEnabled}
                        onChange={(event) => {
                          onUpdateTransmissionSettings({ autoCleanupEnabled: event.currentTarget.checked });
                        }}
                      />
                      {settings.player.transmission.autoCleanupEnabled ? (
                        <Stack gap="sm" className="settings-nested-options">
                          <Switch
                            label={t("settings.playerTransmissionAutoCleanupSlowTaskEnabled")}
                            checked={settings.player.transmission.autoCleanupSlowTaskEnabled}
                            onChange={(event) => {
                              onUpdateTransmissionSettings({ autoCleanupSlowTaskEnabled: event.currentTarget.checked });
                            }}
                          />
                          {settings.player.transmission.autoCleanupSlowTaskEnabled ? (
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                              <NumberInput
                                label={t("settings.playerTransmissionAutoCleanupSlowWindowMinutes")}
                                min={5}
                                max={1440}
                                value={settings.player.transmission.autoCleanupSlowWindowMinutes}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    onUpdateTransmissionSettings({ autoCleanupSlowWindowMinutes: value });
                                  }
                                }}
                              />
                              <NumberInput
                                label={t("settings.playerTransmissionAutoCleanupSlowRateKbps")}
                                min={0}
                                max={102400}
                                value={settings.player.transmission.autoCleanupSlowRateKbps}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    onUpdateTransmissionSettings({ autoCleanupSlowRateKbps: value });
                                  }
                                }}
                              />
                            </SimpleGrid>
                          ) : null}
                          <Switch
                            label={t("settings.playerTransmissionAutoCleanupStorageEnabled")}
                            checked={settings.player.transmission.autoCleanupStorageEnabled}
                            onChange={(event) => {
                              onUpdateTransmissionSettings({ autoCleanupStorageEnabled: event.currentTarget.checked });
                            }}
                          />
                          {settings.player.transmission.autoCleanupStorageEnabled ? (
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                              <NumberInput
                                label={t("settings.playerTransmissionAutoCleanupMaxTasks")}
                                min={1}
                                max={100}
                                value={settings.player.transmission.autoCleanupMaxTasks}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    onUpdateTransmissionSettings({ autoCleanupMaxTasks: value });
                                  }
                                }}
                              />
                              <NumberInput
                                label={t("settings.playerTransmissionAutoCleanupMaxTotalSizeGB")}
                                min={1}
                                max={8192}
                                value={settings.player.transmission.autoCleanupMaxTotalSizeGB}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    onUpdateTransmissionSettings({ autoCleanupMaxTotalSizeGB: value });
                                  }
                                }}
                              />
                              <NumberInput
                                label={t("settings.playerTransmissionAutoCleanupMinFreeSpaceGB")}
                                description={
                                  transmissionTaskStats?.freeSpaceAvailable
                                    ? `${t("settings.playerTransmissionCurrentValueLabel")}: ${formatGiBFromBytes(transmissionTaskStats.freeSpaceBytes)}`
                                    : t("settings.playerTransmissionCurrentValueUnavailable")
                                }
                                min={0}
                                max={8192}
                                value={settings.player.transmission.autoCleanupMinFreeSpaceGB}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    onUpdateTransmissionSettings({ autoCleanupMinFreeSpaceGB: value });
                                  }
                                }}
                              />
                            </SimpleGrid>
                          ) : null}
                        </Stack>
                      ) : null}
                      {downloadMappingTestResult ? (
                        <SettingsResultCard
                          success={downloadMappingTestResult.success}
                          successLabel={t("settings.playerDownloadMappingTestSuccess")}
                          failureLabel={t("settings.playerDownloadMappingTestFailed")}
                          latencyLabel={t("settings.playerTransmissionLatency")}
                          latencyMs={downloadMappingTestResult.latencyMs}
                          messageLabel={t("settings.playerTransmissionMessage")}
                          message={downloadMappingTestResult.message}
                          lines={[
                            { label: t("settings.playerTransmissionLocalDirProbe"), value: downloadMappingTestResult.directory || "-" },
                            {
                              label: t("settings.playerTransmissionLocalDirStatus"),
                              value: `${String(Boolean(downloadMappingTestResult.directoryExists))} / ${String(Boolean(downloadMappingTestResult.directoryIsDir))} / ${String(Boolean(downloadMappingTestResult.directoryReadable))}`
                            },
                            { label: t("settings.playerTransmissionLocalDirEntries"), value: downloadMappingTestResult.directoryEntries ?? 0 },
                            { label: t("settings.playerTransmissionLocalDirError"), value: downloadMappingTestResult.directoryError || "-" }
                          ]}
                        />
                      ) : null}
                      {transmissionTestResult ? (
                        <SettingsResultCard
                          success={transmissionTestResult.success}
                          successLabel={t("settings.playerTransmissionTestSuccess")}
                          failureLabel={t("settings.playerTransmissionTestFailed")}
                          latencyLabel={t("settings.playerTransmissionLatency")}
                          latencyMs={transmissionTestResult.latencyMs}
                          messageLabel={t("settings.playerTransmissionMessage")}
                          message={transmissionTestResult.message}
                          lines={[
                            { label: "", value: transmissionTestResult.url || "-", monospace: true },
                            { label: t("settings.playerTransmissionVersion"), value: transmissionTestResult.version || "-" },
                            { label: t("settings.playerTransmissionRpcVersion"), value: transmissionTestResult.rpcVersion || 0 },
                            { label: t("settings.playerTransmissionRpcVersionMin"), value: transmissionTestResult.rpcVersionMin || 0 },
                            { label: t("settings.playerTransmissionDownloadDir"), value: transmissionTestResult.downloadDir || "-" },
                            {
                              label: t("settings.playerDownloadMappingModeLabel"),
                              value: formatDownloadMappingMode(transmissionTestResult.downloadMapping?.mode, t)
                            },
                            { label: t("settings.playerDownloadMappingSummary"), value: transmissionTestResult.downloadMapping?.message || "-" }
                          ]}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                </Card>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="player-ffmpeg">
              <Accordion.Control>{t("settings.playerFfmpegTitle")}</Accordion.Control>
              <Accordion.Panel>
                <Card className="settings-section-block" radius="lg">
                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">{t("settings.playerFfmpegHint")}</Text>
                    <Badge variant="light" color="blue">{t("settings.playerRequiredEnabled")}</Badge>
                    <Stack gap="sm" className="settings-toggle-panel">
                      <Group justify="flex-end">
                        <Button variant="light" size="xs" loading={ffmpegTesting} onClick={onTestFfmpeg}>
                          {t("settings.playerFfmpegTestButton")}
                        </Button>
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <TextInput
                          label={t("settings.playerFfmpegBinaryPath")}
                          value={settings.player.ffmpeg.binaryPath}
                          onChange={(event) => {
                            onUpdateFfmpegSettings({ binaryPath: event.currentTarget.value });
                          }}
                        />
                        <TextInput
                          label={t("settings.playerFfmpegPreset")}
                          value={settings.player.ffmpeg.preset}
                          onChange={(event) => {
                            onUpdateFfmpegSettings({ preset: event.currentTarget.value });
                          }}
                        />
                        <NumberInput
                          label={t("settings.playerFfmpegCrf")}
                          min={16}
                          max={38}
                          value={settings.player.ffmpeg.crf}
                          onChange={(value) => {
                            if (typeof value === "number" && Number.isFinite(value)) {
                              onUpdateFfmpegSettings({ crf: value });
                            }
                          }}
                        />
                        <NumberInput
                          label={t("settings.playerFfmpegAudioBitrate")}
                          min={64}
                          max={320}
                          value={settings.player.ffmpeg.audioBitrateKbps}
                          onChange={(value) => {
                            if (typeof value === "number" && Number.isFinite(value)) {
                              onUpdateFfmpegSettings({ audioBitrateKbps: value });
                            }
                          }}
                        />
                        <NumberInput
                          label={t("settings.playerFfmpegThreads")}
                          min={0}
                          max={32}
                          value={settings.player.ffmpeg.threads}
                          onChange={(value) => {
                            if (typeof value === "number" && Number.isFinite(value)) {
                              onUpdateFfmpegSettings({ threads: value });
                            }
                          }}
                        />
                        <TextInput
                          label={t("settings.playerFfmpegExtraArgs")}
                          value={settings.player.ffmpeg.extraArgs}
                          onChange={(event) => {
                            onUpdateFfmpegSettings({ extraArgs: event.currentTarget.value });
                          }}
                        />
                      </SimpleGrid>
                      {ffmpegTestResult ? (
                        <SettingsResultCard
                          success={ffmpegTestResult.success}
                          successLabel={t("settings.playerFfmpegTestSuccess")}
                          failureLabel={t("settings.playerFfmpegTestFailed")}
                          latencyLabel={t("settings.playerFfmpegLatency")}
                          latencyMs={ffmpegTestResult.latencyMs}
                          messageLabel={t("settings.playerFfmpegMessage")}
                          message={ffmpegTestResult.message}
                          lines={[
                            { label: t("settings.playerFfmpegVersion"), value: ffmpegTestResult.version || "-" },
                            { label: t("settings.playerFfmpegBinaryPath"), value: ffmpegTestResult.binaryPath || "-" },
                            { label: "", value: ffmpegTestResult.argsPreview || "-", monospace: true }
                          ]}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                </Card>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        ) : (
          <Card className="settings-section-block" radius="lg">
            <Text c="dimmed" size="sm">{t("settings.playerDisabledAdvancedHint")}</Text>
          </Card>
        )}
      </Stack>
    </Tabs.Panel>
  );
}

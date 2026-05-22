"use client";

import type { RefCallback } from "react";
import { ActionIcon, Button, Card, Group, Loader, Stack, Tabs, Text, Tooltip, Title } from "@mantine/core";
import { LogIn, RefreshCw, Save } from "lucide-react";
import type { PerformancePresetKey } from "./settings-page.defaults";
import type { PluginInputs, SubtitleTemplate, SubtitleTemplateForm, SystemSettings, RuntimeStatus, PluginTestResult, TransmissionConnectivityResult, DownloadMappingConnectivityResult, TransmissionTaskStats, FFmpegConnectivityResult } from "./settings-page.types";
import type { RuntimeWorkerDetail } from "./settings-page.logic";
import { SettingsAccessTab } from "./settings-page-access-tab";
import { SettingsPerformanceTab, type SettingsPageStateSetter } from "./settings-page-tabs";
import { SettingsPageContentTab } from "./settings-page-content-tab";
import { SettingsPagePlayerTab } from "./settings-page-player-tab";
import { SettingsPageSubtitleModal } from "./settings-page-subtitle-modal";

type TFunction = (key: string) => string;

type SettingsPageViewProps = {
  t: TFunction;
  authLoading: boolean;
  hasAdminAccess: boolean;
  loading: boolean;
  saving: boolean;
  runtimeStatusLoading: boolean;
  runtimeStatus: RuntimeStatus | null;
  workerRestarting: Record<string, boolean>;
  settings: SystemSettings;
  initialSettings: SystemSettings | null;
  pluginInputs: PluginInputs;
  setSettings: SettingsPageStateSetter<SystemSettings>;
  setPluginInputs: SettingsPageStateSetter<PluginInputs>;
  pluginTesting: Record<string, boolean>;
  pluginResults: Record<string, PluginTestResult | null>;
  runPluginTest: (plugin: "tmdb" | "imdb" | "douban") => void;
  subtitleTemplates: SubtitleTemplate[];
  subtitleTemplatesLoading: boolean;
  subtitleTemplateDeleting: Record<string, boolean>;
  openCreateSubtitleModal: () => void;
  openEditSubtitleModal: (template: SubtitleTemplate) => void;
  deleteSubtitleTemplate: (templateId: string) => void;
  transmissionTesting: boolean;
  downloadMappingTesting: boolean;
  transmissionTestResult: TransmissionConnectivityResult | null;
  downloadMappingTestResult: DownloadMappingConnectivityResult | null;
  transmissionTaskStats: TransmissionTaskStats | null;
  ffmpegTesting: boolean;
  ffmpegTestResult: FFmpegConnectivityResult | null;
  dhtScheduleInvalid: boolean;
  tabsRef: RefCallback<HTMLDivElement>;
  onOpenLogin: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onLoadRuntimeStatus: () => void;
  onRestartWorker: (workerKey: string) => void;
  onApplyPerformancePreset: (preset: PerformancePresetKey) => void;
  onUpdateDHTPerformance: (updates: Partial<SystemSettings["performance"]["dht"]>) => void;
  onUpdateMediaPerformance: (updates: Partial<SystemSettings["performance"]["media"]>) => void;
  onUpdateQueuePerformance: (updates: Partial<SystemSettings["performance"]["queue"]>) => void;
  renderPerformanceLabel: (label: string, impact: string) => React.ReactNode;
  formatRuntimeCheckedAt: (value: string) => string;
  renderRuntimeValue: (value: string) => React.ReactNode;
  workerDetails: (key: string) => RuntimeWorkerDetail;
  onResetPlayerDefaults: () => void;
  onTogglePlayerEnabled: (checked: boolean) => void;
  onUpdatePlayerSettings: (updates: Partial<SystemSettings["player"]>) => void;
  onUpdateTransmissionSettings: (updates: Partial<SystemSettings["player"]["transmission"]>) => void;
  onUpdateFfmpegSettings: (updates: Partial<SystemSettings["player"]["ffmpeg"]>) => void;
  onTestTransmission: () => void;
  onTestDownloadMapping: () => void;
  onTestFfmpeg: () => void;
  subtitleModalOpened: boolean;
  subtitleModalSaving: boolean;
  subtitleModalMode: "create" | "edit";
  subtitleForm: SubtitleTemplateForm;
  onCloseSubtitleModal: () => void;
  onSubmitSubtitleModal: () => void;
  onChangeSubtitleForm: (updater: (current: SubtitleTemplateForm) => SubtitleTemplateForm) => void;
};

export function SettingsPageView(props: SettingsPageViewProps) {
  const {
    t,
    authLoading,
    hasAdminAccess,
    loading,
    saving,
    runtimeStatusLoading,
    runtimeStatus,
    workerRestarting,
    settings,
    pluginInputs,
    setSettings,
    setPluginInputs,
    pluginTesting,
    pluginResults,
    runPluginTest,
    subtitleTemplates,
    subtitleTemplatesLoading,
    subtitleTemplateDeleting,
    openCreateSubtitleModal,
    openEditSubtitleModal,
    deleteSubtitleTemplate,
    transmissionTesting,
    downloadMappingTesting,
    transmissionTestResult,
    downloadMappingTestResult,
    transmissionTaskStats,
    ffmpegTesting,
    ffmpegTestResult,
    dhtScheduleInvalid,
    tabsRef,
    onOpenLogin,
    onRefresh,
    onSave,
    onLoadRuntimeStatus,
    onRestartWorker,
    onApplyPerformancePreset,
    onUpdateDHTPerformance,
    onUpdateMediaPerformance,
    onUpdateQueuePerformance,
    renderPerformanceLabel,
    formatRuntimeCheckedAt,
    renderRuntimeValue,
    workerDetails,
    onResetPlayerDefaults,
    onTogglePlayerEnabled,
    onUpdatePlayerSettings,
    onUpdateTransmissionSettings,
    onUpdateFfmpegSettings,
    onTestTransmission,
    onTestDownloadMapping,
    onTestFfmpeg,
    subtitleModalOpened,
    subtitleModalSaving,
    subtitleModalMode,
    subtitleForm,
    onCloseSubtitleModal,
    onSubmitSubtitleModal,
    onChangeSubtitleForm
  } = props;

  if (authLoading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!hasAdminAccess) {
    return (
      <Card className="glass-card" withBorder maw={560} mx="auto">
        <Stack>
          <Title order={2}>{t("auth.adminOnly")}</Title>
          <Text c="dimmed">{t("auth.adminOnlyDesc")}</Text>
          <Button leftSection={<LogIn size={15} />} w="fit-content" onClick={onOpenLogin}>
            {t("auth.login")}
          </Button>
        </Stack>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card className="glass-card" withBorder>
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={4}>
            <Title order={2}>{t("settings.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("settings.subtitle")}</Text>
          </Stack>
          <Group>
            <Tooltip label={t("common.refresh")} withArrow>
              <ActionIcon
                className="app-icon-btn spin-on-active"
                data-spinning={runtimeStatusLoading || loading ? "true" : "false"}
                variant="default"
                size="lg"
                onClick={onRefresh}
                aria-label={t("common.refresh")}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("settings.save")} withArrow>
              <ActionIcon
                className="app-icon-btn"
                variant="light"
                size="lg"
                loading={saving}
                disabled={dhtScheduleInvalid}
                onClick={onSave}
                aria-label={t("settings.save")}
              >
                <Save size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs ref={tabsRef} className="app-tabs" defaultValue="performance">
          <Tabs.List grow>
            <Tabs.Tab value="performance">{t("settings.tabPerformance")}</Tabs.Tab>
            <Tabs.Tab value="content">{t("settings.tabContent")}</Tabs.Tab>
            <Tabs.Tab value="access">{t("settings.tabAccess")}</Tabs.Tab>
            <Tabs.Tab value="player">{t("settings.tabPlayer")}</Tabs.Tab>
          </Tabs.List>

          <SettingsPerformanceTab
            t={t}
            settings={settings}
            runtimeStatus={runtimeStatus}
            runtimeStatusLoading={runtimeStatusLoading}
            workerRestarting={workerRestarting}
            onReloadRuntimeStatus={onLoadRuntimeStatus}
            onRestartWorker={onRestartWorker}
            onApplyPerformancePreset={onApplyPerformancePreset}
            onUpdateDHTPerformance={onUpdateDHTPerformance}
            onUpdateMediaPerformance={onUpdateMediaPerformance}
            onUpdateQueuePerformance={onUpdateQueuePerformance}
            renderPerformanceLabel={renderPerformanceLabel}
            formatRuntimeCheckedAt={formatRuntimeCheckedAt}
            renderRuntimeValue={renderRuntimeValue}
            workerDetails={workerDetails}
          />

          <SettingsPageContentTab
            t={t}
            settings={settings}
            setSettings={setSettings}
            pluginInputs={pluginInputs}
            setPluginInputs={setPluginInputs}
            pluginTesting={pluginTesting}
            pluginResults={pluginResults}
            runPluginTest={runPluginTest}
            subtitleTemplates={subtitleTemplates}
            subtitleTemplatesLoading={subtitleTemplatesLoading}
            subtitleTemplateDeleting={subtitleTemplateDeleting}
            openCreateSubtitleModal={openCreateSubtitleModal}
            openEditSubtitleModal={openEditSubtitleModal}
            deleteSubtitleTemplate={deleteSubtitleTemplate}
          />

          <SettingsAccessTab t={t} settings={settings} setSettings={setSettings} />

          <SettingsPagePlayerTab
            t={t}
            settings={settings}
            transmissionTesting={transmissionTesting}
            downloadMappingTesting={downloadMappingTesting}
            transmissionTestResult={transmissionTestResult}
            downloadMappingTestResult={downloadMappingTestResult}
            transmissionTaskStats={transmissionTaskStats}
            ffmpegTesting={ffmpegTesting}
            ffmpegTestResult={ffmpegTestResult}
            onResetDefaults={onResetPlayerDefaults}
            onToggleEnabled={onTogglePlayerEnabled}
            onUpdatePlayerSettings={onUpdatePlayerSettings}
            onUpdateTransmissionSettings={onUpdateTransmissionSettings}
            onUpdateFfmpegSettings={onUpdateFfmpegSettings}
            onTestTransmission={onTestTransmission}
            onTestDownloadMapping={onTestDownloadMapping}
            onTestFfmpeg={onTestFfmpeg}
          />
        </Tabs>
      </Card>

      <SettingsPageSubtitleModal
        t={t}
        opened={subtitleModalOpened}
        saving={subtitleModalSaving}
        mode={subtitleModalMode}
        form={subtitleForm}
        onClose={onCloseSubtitleModal}
        onSubmit={onSubmitSubtitleModal}
        onChangeForm={onChangeSubtitleForm}
      />
    </Stack>
  );
}

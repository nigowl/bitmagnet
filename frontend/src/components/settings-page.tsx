"use client";

import { useCallback, useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useTabsUnderline } from "@/lib/use-tabs-underline";
import { useI18n } from "@/languages/provider";

import {
  DEFAULT_PLAYER_SETTINGS,
  PERFORMANCE_PRESETS,
  type PerformancePresetKey
} from "./settings-page.defaults";
import {
  type DownloadMappingConnectivityResponse,
  type DownloadMappingConnectivityResult,
  type FFmpegConnectivityResponse,
  type FFmpegConnectivityResult,
  type RuntimeStatus,
  type RuntimeStatusResponse,
  type SettingsResponse,
  type SystemSettings,
  type TransmissionConnectivityResponse,
  type TransmissionConnectivityResult,
  type TransmissionTaskStats,
  type TransmissionTaskStatsResponse,
  type WorkerRestartResponse
} from "./settings-page.types";
import { buildSettingsUpdatePayload, createDefaultSystemSettings, normalizeSystemSettings } from "./settings-page.helpers";
import {
  createPerformanceLabelRenderer,
  createRuntimeValueRenderer,
  formatRuntimeCheckedAt,
  isDhtScheduleInvalid,
  prettifyGoDuration,
  resolveWorkerDetails
} from "./settings-page.logic";
import { usePluginTestsController } from "./settings-page-plugin-tests";
import { useSubtitleTemplatesController } from "./settings-page-subtitle-templates";
import { SettingsPageView } from "./settings-page.view";

export function SettingsPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runtimeStatusLoading, setRuntimeStatusLoading] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [workerRestarting, setWorkerRestarting] = useState<Record<string, boolean>>({});
  const [initialSettings, setInitialSettings] = useState<SystemSettings | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(() => createDefaultSystemSettings());
  const [transmissionTesting, setTransmissionTesting] = useState(false);
  const [downloadMappingTesting, setDownloadMappingTesting] = useState(false);
  const [transmissionTestResult, setTransmissionTestResult] = useState<TransmissionConnectivityResult | null>(null);
  const [downloadMappingTestResult, setDownloadMappingTestResult] = useState<DownloadMappingConnectivityResult | null>(null);
  const [transmissionTaskStats, setTransmissionTaskStats] = useState<TransmissionTaskStats | null>(null);
  const [ffmpegTesting, setFFmpegTesting] = useState(false);
  const [ffmpegTestResult, setFFmpegTestResult] = useState<FFmpegConnectivityResult | null>(null);
  const tabsRef = useTabsUnderline();
  const {
    pluginInputs,
    setPluginInputs,
    pluginTesting,
    pluginResults,
    runPluginTest
  } = usePluginTestsController();
  const {
    subtitleTemplates,
    subtitleTemplatesLoading,
    subtitleTemplateDeleting,
    subtitleModalOpened,
    subtitleModalSaving,
    subtitleModalMode,
    subtitleForm,
    setSubtitleForm,
    loadSubtitleTemplates,
    deleteSubtitleTemplate,
    openCreateSubtitleModal,
    openEditSubtitleModal,
    closeSubtitleModal,
    submitSubtitleModal
  } = useSubtitleTemplatesController({ isAdmin, t });

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await apiRequest<SettingsResponse>("/api/admin/settings");
      const normalized = normalizeSystemSettings(data.settings, DEFAULT_PLAYER_SETTINGS.enabled);
      setSettings(normalized);
      setInitialSettings(normalized);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadSettings();
  }, [isAdmin, loadSettings]);

  const loadRuntimeStatus = useCallback(async () => {
    if (!isAdmin) return;
    setRuntimeStatusLoading(true);
    try {
      const data = await apiRequest<RuntimeStatusResponse>("/api/admin/settings/runtime-status");
      setRuntimeStatus(data.status);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setRuntimeStatusLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadRuntimeStatus();
  }, [isAdmin, loadRuntimeStatus]);

  const saveSettings = async () => {
    const payload = buildSettingsUpdatePayload(settings, initialSettings);
    if (Object.keys(payload).length === 0) {
      notifications.show({ color: "blue", message: t("settings.noChanges") });
      return;
    }

    setSaving(true);
    try {
      const data = await apiRequest<SettingsResponse>("/api/admin/settings", { method: "PUT", data: payload });
      const normalized = normalizeSystemSettings(data.settings, settings.player.enabled);
      setSettings(normalized);
      setInitialSettings(normalized);
      if (typeof data.settings.player?.enabled !== "boolean") {
        notifications.show({
          color: "yellow",
          message: "后端未返回 player.enabled，已临时保留当前开关状态。请重启后端后再保存一次。"
        });
      }
      void loadRuntimeStatus();
      if (normalized.player?.enabled) {
        void loadTransmissionTaskStats();
      } else {
        setTransmissionTaskStats(null);
      }
      notifications.show({ color: "green", message: t("settings.saved") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const updateDHTPerformance = (updates: Partial<SystemSettings["performance"]["dht"]>) => {
    setSettings((current) => ({
      ...current,
      performance: {
        ...current.performance,
        dht: {
          ...current.performance.dht,
          ...updates
        }
      }
    }));
  };

  const updateQueuePerformance = (updates: Partial<SystemSettings["performance"]["queue"]>) => {
    setSettings((current) => ({
      ...current,
      performance: {
        ...current.performance,
        queue: {
          ...current.performance.queue,
          ...updates
        }
      }
    }));
  };

  const updateMediaPerformance = (updates: Partial<SystemSettings["performance"]["media"]>) => {
    setSettings((current) => ({
      ...current,
      performance: {
        ...current.performance,
        media: {
          ...current.performance.media,
          ...updates
        }
      }
    }));
  };

  const updatePlayerSettings = (updates: Partial<SystemSettings["player"]>) => {
    setSettings((current) => ({
      ...current,
      player: {
        ...current.player,
        ...updates
      }
    }));
  };

  const updatePlayerTransmissionSettings = (updates: Partial<SystemSettings["player"]["transmission"]>) => {
    setSettings((current) => ({
      ...current,
      player: {
        ...current.player,
        transmission: {
          ...current.player.transmission,
          ...updates
        }
      }
    }));
  };

  const updatePlayerFFmpegSettings = (updates: Partial<SystemSettings["player"]["ffmpeg"]>) => {
    setSettings((current) => ({
      ...current,
      player: {
        ...current.player,
        ffmpeg: {
          ...current.player.ffmpeg,
          ...updates
        }
      }
    }));
  };

  const resetPlayerDefaults = () => {
    updatePlayerSettings({
      ...DEFAULT_PLAYER_SETTINGS,
      transmission: { ...DEFAULT_PLAYER_SETTINGS.transmission },
      ffmpeg: { ...DEFAULT_PLAYER_SETTINGS.ffmpeg }
    });
    notifications.show({ color: "green", message: t("settings.playerDefaultsRestored") });
  };

  const loadTransmissionTaskStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await apiRequest<TransmissionTaskStatsResponse>("/api/admin/settings/player/transmission/tasks/stats");
      setTransmissionTaskStats(data.stats || null);
    } catch {
      setTransmissionTaskStats(null);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!settings.player.enabled) {
      setTransmissionTaskStats(null);
      return;
    }
    void loadTransmissionTaskStats();
  }, [isAdmin, loadTransmissionTaskStats, settings.player.enabled]);

  const testPlayerTransmission = async () => {
    setTransmissionTesting(true);
    try {
      const payload = {
        url: settings.player.transmission.url,
        localDownloadDir: settings.player.transmission.localDownloadDir,
        downloadMappingDirectory: settings.player.transmission.downloadMappingDirectory,
        username: settings.player.transmission.username,
        password: settings.player.transmission.password,
        insecureTls: settings.player.transmission.insecureTls,
        timeoutSeconds: settings.player.transmission.timeoutSeconds
      };
      const data = await apiRequest<TransmissionConnectivityResponse>("/api/admin/settings/player/transmission/test", {
        method: "POST",
        data: payload
      });
      setTransmissionTestResult(data.result);
      if (data.result.downloadMapping) {
        setDownloadMappingTestResult(data.result.downloadMapping);
      }
      notifications.show({
        color: data.result.success ? "green" : "yellow",
        message: data.result.success ? t("settings.playerTransmissionTestSuccess") : t("settings.playerTransmissionTestFailed")
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      void loadTransmissionTaskStats();
      setTransmissionTesting(false);
    }
  };

  const testDownloadMapping = async () => {
    setDownloadMappingTesting(true);
    try {
      const payload = {
        directory: settings.player.transmission.downloadMappingDirectory,
        timeoutSeconds: settings.player.transmission.timeoutSeconds
      };
      const data = await apiRequest<DownloadMappingConnectivityResponse>("/api/admin/settings/player/transmission/download-mapping/test", {
        method: "POST",
        data: payload
      });
      setDownloadMappingTestResult(data.result);
      notifications.show({
        color: data.result.success ? "green" : "yellow",
        message: data.result.success ? t("settings.playerDownloadMappingTestSuccess") : t("settings.playerDownloadMappingTestFailed")
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setDownloadMappingTesting(false);
    }
  };

  const testPlayerFFmpeg = async () => {
    setFFmpegTesting(true);
    try {
      const payload = {
        binaryPath: settings.player.ffmpeg.binaryPath,
        preset: settings.player.ffmpeg.preset,
        crf: settings.player.ffmpeg.crf,
        audioBitrateKbps: settings.player.ffmpeg.audioBitrateKbps,
        threads: settings.player.ffmpeg.threads,
        extraArgs: settings.player.ffmpeg.extraArgs
      };
      const data = await apiRequest<FFmpegConnectivityResponse>("/api/admin/settings/player/ffmpeg/test", {
        method: "POST",
        data: payload
      });
      setFFmpegTestResult(data.result);
      notifications.show({
        color: data.result.success ? "green" : "yellow",
        message: data.result.success ? t("settings.playerFfmpegTestSuccess") : t("settings.playerFfmpegTestFailed")
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setFFmpegTesting(false);
    }
  };

  const applyPerformancePreset = (preset: PerformancePresetKey) => {
    const next = PERFORMANCE_PRESETS[preset];
    setSettings((current) => ({
      ...current,
      performance: {
        dht: {
          ...next.dht,
          scheduleEnabled: current.performance.dht.scheduleEnabled,
          scheduleWeekdays: [...current.performance.dht.scheduleWeekdays],
          scheduleStartHour: current.performance.dht.scheduleStartHour,
          scheduleEndHour: current.performance.dht.scheduleEndHour
        },
        queue: { ...next.queue },
        media: { ...next.media }
      }
    }));
    notifications.show({
      color: "green",
      message: `${t("settings.performancePresetApplied")} ${t(`settings.performancePresetOptions.${preset}`)}`
    });
  };

  const dhtScheduleInvalid = isDhtScheduleInvalid(settings);
  const renderPerformanceLabel = createPerformanceLabelRenderer(t);
  const renderRuntimeValue = createRuntimeValueRenderer();
  const workerDetails = (key: string) => resolveWorkerDetails(t, key);

  const restartWorker = async (workerKey: string) => {
    setWorkerRestarting((current) => ({ ...current, [workerKey]: true }));
    try {
      const data = await apiRequest<WorkerRestartResponse>(`/api/admin/settings/workers/${encodeURIComponent(workerKey)}/restart`, {
        method: "POST"
      });
      const workerReport = Array.isArray(data.report?.workers) ? data.report?.workers?.[0] : undefined;
      const phaseText = Array.isArray(workerReport?.phases)
        ? workerReport.phases
          .map((phase) => `${phase.name || "phase"}=${phase.status || "-"}(${prettifyGoDuration(phase.elapsed)})`)
          .join(" · ")
        : "";
      const elapsedText = prettifyGoDuration(data.report?.elapsed);
      const message = phaseText
        ? `${t("settings.workerRestartDone")} · ${t("settings.workerRestartElapsed")}: ${elapsedText} · ${phaseText}`
        : `${t("settings.workerRestartDone")} · ${t("settings.workerRestartElapsed")}: ${elapsedText}`;
      notifications.show({ color: "green", message });
      await loadRuntimeStatus();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setWorkerRestarting((current) => ({ ...current, [workerKey]: false }));
    }
  };

  return (
    <SettingsPageView
      t={t}
      authLoading={authLoading}
      hasAdminAccess={Boolean(user && isAdmin)}
      loading={loading}
      saving={saving}
      runtimeStatusLoading={runtimeStatusLoading}
      runtimeStatus={runtimeStatus}
      workerRestarting={workerRestarting}
      settings={settings}
      initialSettings={initialSettings}
      pluginInputs={pluginInputs}
      setSettings={setSettings}
      setPluginInputs={setPluginInputs}
      pluginTesting={pluginTesting}
      pluginResults={pluginResults}
      runPluginTest={(plugin) => {
        void runPluginTest(plugin);
      }}
      subtitleTemplates={subtitleTemplates}
      subtitleTemplatesLoading={subtitleTemplatesLoading}
      subtitleTemplateDeleting={subtitleTemplateDeleting}
      openCreateSubtitleModal={openCreateSubtitleModal}
      openEditSubtitleModal={openEditSubtitleModal}
      deleteSubtitleTemplate={(templateId) => {
        void deleteSubtitleTemplate(templateId);
      }}
      transmissionTesting={transmissionTesting}
      downloadMappingTesting={downloadMappingTesting}
      transmissionTestResult={transmissionTestResult}
      downloadMappingTestResult={downloadMappingTestResult}
      transmissionTaskStats={transmissionTaskStats}
      ffmpegTesting={ffmpegTesting}
      ffmpegTestResult={ffmpegTestResult}
      dhtScheduleInvalid={dhtScheduleInvalid}
      tabsRef={tabsRef}
      onOpenLogin={openLogin}
      onRefresh={() => {
        void loadSettings();
        void loadRuntimeStatus();
        void loadSubtitleTemplates();
      }}
      onSave={() => void saveSettings()}
      onLoadRuntimeStatus={() => void loadRuntimeStatus()}
      onRestartWorker={(workerKey) => {
        void restartWorker(workerKey);
      }}
      onApplyPerformancePreset={applyPerformancePreset}
      onUpdateDHTPerformance={updateDHTPerformance}
      onUpdateMediaPerformance={updateMediaPerformance}
      onUpdateQueuePerformance={updateQueuePerformance}
      renderPerformanceLabel={renderPerformanceLabel}
      formatRuntimeCheckedAt={formatRuntimeCheckedAt}
      renderRuntimeValue={renderRuntimeValue}
      workerDetails={workerDetails}
      onResetPlayerDefaults={resetPlayerDefaults}
      onTogglePlayerEnabled={(checked) => {
        updatePlayerSettings({
          enabled: checked,
          transmission: {
            ...settings.player.transmission,
            enabled: checked
          },
          ffmpeg: {
            ...settings.player.ffmpeg,
            enabled: checked
          }
        });
      }}
      onUpdatePlayerSettings={updatePlayerSettings}
      onUpdateTransmissionSettings={updatePlayerTransmissionSettings}
      onUpdateFfmpegSettings={updatePlayerFFmpegSettings}
      onTestTransmission={() => void testPlayerTransmission()}
      onTestDownloadMapping={() => void testDownloadMapping()}
      onTestFfmpeg={() => void testPlayerFFmpeg()}
      subtitleModalOpened={subtitleModalOpened}
      subtitleModalSaving={subtitleModalSaving}
      subtitleModalMode={subtitleModalMode}
      subtitleForm={subtitleForm}
      onCloseSubtitleModal={closeSubtitleModal}
      onSubmitSubtitleModal={() => void submitSubtitleModal()}
      onChangeSubtitleForm={(updater) => {
        setSubtitleForm(updater);
      }}
    />
  );
}

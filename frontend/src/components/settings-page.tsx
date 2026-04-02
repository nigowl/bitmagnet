"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Accordion,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { CircleHelp, LogIn, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useTabsUnderline } from "@/lib/use-tabs-underline";
import { useI18n } from "@/languages/provider";

type SystemSettings = {
  tmdbEnabled: boolean;
  imdbEnabled: boolean;
  doubanEnabled: boolean;
  doubanMinScore: number;
  doubanCookie: string;
  doubanUserAgent: string;
  doubanAcceptLanguage: string;
  doubanReferer: string;
  performance: {
    dht: {
      scalingFactor: number;
      reseedIntervalSeconds: number;
      saveFilesThreshold: number;
      savePieces: boolean;
      rescrapeThresholdHours: number;
      statusLogIntervalSeconds: number;
      getOldestNodesIntervalSeconds: number;
      oldPeerThresholdMinutes: number;
    };
    queue: {
      processTorrentConcurrency: number;
      processTorrentCheckIntervalSeconds: number;
      processTorrentTimeoutSeconds: number;
      processTorrentBatchConcurrency: number;
      processTorrentBatchCheckIntervalSeconds: number;
      processTorrentBatchTimeoutSeconds: number;
      refreshMediaMetadataConcurrency: number;
      refreshMediaMetadataCheckIntervalSeconds: number;
      refreshMediaMetadataTimeoutSeconds: number;
      backfillCoverCacheConcurrency: number;
      backfillCoverCacheCheckIntervalSeconds: number;
      backfillCoverCacheTimeoutSeconds: number;
    };
    media: {
      autoCacheCover: boolean;
      autoFetchBilingual: boolean;
    };
  };
};

type SettingsResponse = {
  settings: SystemSettings;
};

type RuntimeSettingStatus = {
  key: string;
  value: string;
  source: "runtime" | "default";
};

type WorkerRuntimeStatus = {
  key: string;
  enabled: boolean;
  started: boolean;
};

type RuntimeStatus = {
  checkedAt: string;
  settings: RuntimeSettingStatus[];
  workers: WorkerRuntimeStatus[];
};

type RuntimeStatusResponse = {
  status: RuntimeStatus;
};

type PluginTestResult = {
  plugin: string;
  success: boolean;
  message: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs?: string[];
};

type PluginTestResponse = {
  result: PluginTestResult;
};

type SubtitleTemplate = {
  id: string;
  name: string;
  urlTemplate: string;
  enabled: boolean;
};

type SubtitleTemplatesResponse = {
  templates: SubtitleTemplate[];
};

type SubtitleTemplateResponse = {
  template: SubtitleTemplate;
};

type PerformancePresetKey = "resource" | "realtime" | "throughput";

const PERFORMANCE_PRESETS: Record<PerformancePresetKey, SystemSettings["performance"]> = {
  resource: {
    dht: {
      scalingFactor: 4,
      reseedIntervalSeconds: 120,
      saveFilesThreshold: 80,
      savePieces: false,
      rescrapeThresholdHours: 24 * 30,
      statusLogIntervalSeconds: 90,
      getOldestNodesIntervalSeconds: 20,
      oldPeerThresholdMinutes: 20
    },
    queue: {
      processTorrentConcurrency: 1,
      processTorrentCheckIntervalSeconds: 45,
      processTorrentTimeoutSeconds: 10 * 60,
      processTorrentBatchConcurrency: 1,
      processTorrentBatchCheckIntervalSeconds: 45,
      processTorrentBatchTimeoutSeconds: 10 * 60,
      refreshMediaMetadataConcurrency: 1,
      refreshMediaMetadataCheckIntervalSeconds: 45,
      refreshMediaMetadataTimeoutSeconds: 20 * 60,
      backfillCoverCacheConcurrency: 1,
      backfillCoverCacheCheckIntervalSeconds: 45,
      backfillCoverCacheTimeoutSeconds: 20 * 60
    },
    media: {
      autoCacheCover: false,
      autoFetchBilingual: false
    }
  },
  realtime: {
    dht: {
      scalingFactor: 8,
      reseedIntervalSeconds: 30,
      saveFilesThreshold: 100,
      savePieces: false,
      rescrapeThresholdHours: 24 * 7,
      statusLogIntervalSeconds: 30,
      getOldestNodesIntervalSeconds: 6,
      oldPeerThresholdMinutes: 10
    },
    queue: {
      processTorrentConcurrency: 2,
      processTorrentCheckIntervalSeconds: 8,
      processTorrentTimeoutSeconds: 10 * 60,
      processTorrentBatchConcurrency: 1,
      processTorrentBatchCheckIntervalSeconds: 10,
      processTorrentBatchTimeoutSeconds: 10 * 60,
      refreshMediaMetadataConcurrency: 2,
      refreshMediaMetadataCheckIntervalSeconds: 10,
      refreshMediaMetadataTimeoutSeconds: 20 * 60,
      backfillCoverCacheConcurrency: 2,
      backfillCoverCacheCheckIntervalSeconds: 10,
      backfillCoverCacheTimeoutSeconds: 20 * 60
    },
    media: {
      autoCacheCover: true,
      autoFetchBilingual: true
    }
  },
  throughput: {
    dht: {
      scalingFactor: 20,
      reseedIntervalSeconds: 30,
      saveFilesThreshold: 300,
      savePieces: false,
      rescrapeThresholdHours: 24 * 7,
      statusLogIntervalSeconds: 30,
      getOldestNodesIntervalSeconds: 5,
      oldPeerThresholdMinutes: 10
    },
    queue: {
      processTorrentConcurrency: 4,
      processTorrentCheckIntervalSeconds: 10,
      processTorrentTimeoutSeconds: 15 * 60,
      processTorrentBatchConcurrency: 3,
      processTorrentBatchCheckIntervalSeconds: 10,
      processTorrentBatchTimeoutSeconds: 15 * 60,
      refreshMediaMetadataConcurrency: 3,
      refreshMediaMetadataCheckIntervalSeconds: 15,
      refreshMediaMetadataTimeoutSeconds: 30 * 60,
      backfillCoverCacheConcurrency: 2,
      backfillCoverCacheCheckIntervalSeconds: 15,
      backfillCoverCacheTimeoutSeconds: 30 * 60
    },
    media: {
      autoCacheCover: true,
      autoFetchBilingual: true
    }
  }
};

export function SettingsPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runtimeStatusLoading, setRuntimeStatusLoading] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({
    tmdbEnabled: true,
    imdbEnabled: true,
    doubanEnabled: true,
    doubanMinScore: 0.62,
    doubanCookie: "",
    doubanUserAgent: "",
    doubanAcceptLanguage: "",
    doubanReferer: "",
    performance: {
      dht: {
        scalingFactor: 10,
        reseedIntervalSeconds: 60,
        saveFilesThreshold: 100,
        savePieces: false,
        rescrapeThresholdHours: 24 * 30,
        statusLogIntervalSeconds: 45,
        getOldestNodesIntervalSeconds: 10,
        oldPeerThresholdMinutes: 15
      },
      queue: {
        processTorrentConcurrency: 1,
        processTorrentCheckIntervalSeconds: 30,
        processTorrentTimeoutSeconds: 10 * 60,
        processTorrentBatchConcurrency: 1,
        processTorrentBatchCheckIntervalSeconds: 30,
        processTorrentBatchTimeoutSeconds: 10 * 60,
        refreshMediaMetadataConcurrency: 1,
        refreshMediaMetadataCheckIntervalSeconds: 30,
        refreshMediaMetadataTimeoutSeconds: 20 * 60,
        backfillCoverCacheConcurrency: 1,
        backfillCoverCacheCheckIntervalSeconds: 30,
        backfillCoverCacheTimeoutSeconds: 20 * 60
      },
      media: {
        autoCacheCover: true,
        autoFetchBilingual: true
      }
    }
  });
  const [pluginTesting, setPluginTesting] = useState<Record<string, boolean>>({});
  const [pluginResults, setPluginResults] = useState<Record<string, PluginTestResult | null>>({});
  const [pluginInputs, setPluginInputs] = useState({
    tmdb: { query: "", contentType: "movie", year: "" },
    imdb: { imdbId: "" },
    douban: { title: "", contentType: "movie", year: "" }
  });
  const [subtitleTemplates, setSubtitleTemplates] = useState<SubtitleTemplate[]>([]);
  const [subtitleTemplatesLoading, setSubtitleTemplatesLoading] = useState(false);
  const [subtitleTemplateDeleting, setSubtitleTemplateDeleting] = useState<Record<string, boolean>>({});
  const [subtitleModalOpened, setSubtitleModalOpened] = useState(false);
  const [subtitleModalSaving, setSubtitleModalSaving] = useState(false);
  const [subtitleModalMode, setSubtitleModalMode] = useState<"create" | "edit">("create");
  const [subtitleEditingId, setSubtitleEditingId] = useState<string | null>(null);
  const [subtitleForm, setSubtitleForm] = useState({
    name: "",
    urlTemplate: "https://subhd.tv/search/{title}",
    enabled: true
  });
  const tabsRef = useTabsUnderline();

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await apiRequest<SettingsResponse>("/api/admin/settings");
      setSettings(data.settings);
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

  const loadSubtitleTemplates = useCallback(async () => {
    if (!isAdmin) return;
    setSubtitleTemplatesLoading(true);
    try {
      const data = await apiRequest<SubtitleTemplatesResponse>("/api/admin/settings/subtitle-templates");
      setSubtitleTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleTemplatesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadSubtitleTemplates();
  }, [isAdmin, loadSubtitleTemplates]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        tmdbEnabled: settings.tmdbEnabled,
        imdbEnabled: settings.imdbEnabled,
        doubanEnabled: settings.doubanEnabled,
        doubanMinScore: settings.doubanMinScore,
        doubanCookie: settings.doubanCookie,
        doubanUserAgent: settings.doubanUserAgent,
        doubanAcceptLanguage: settings.doubanAcceptLanguage,
        doubanReferer: settings.doubanReferer,
        performance: settings.performance
      };
      const data = await apiRequest<SettingsResponse>("/api/admin/settings", { method: "PUT", data: payload });
      setSettings(data.settings);
      void loadRuntimeStatus();
      notifications.show({ color: "green", message: t("settings.saved") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const runPluginTest = async (plugin: "tmdb" | "imdb" | "douban") => {
    setPluginTesting((current) => ({ ...current, [plugin]: true }));
    try {
      let payload: Record<string, unknown> = {};
      if (plugin === "tmdb") {
        payload = {
          query: pluginInputs.tmdb.query,
          contentType: pluginInputs.tmdb.contentType,
          year: parseYear(pluginInputs.tmdb.year)
        };
      } else if (plugin === "imdb") {
        payload = {
          imdbId: pluginInputs.imdb.imdbId
        };
      } else {
        payload = {
          title: pluginInputs.douban.title,
          contentType: pluginInputs.douban.contentType,
          year: parseYear(pluginInputs.douban.year)
        };
      }

      const data = await apiRequest<PluginTestResponse>(`/api/admin/settings/plugins/${plugin}/test`, {
        method: "POST",
        data: payload
      });
      setPluginResults((current) => ({ ...current, [plugin]: data.result }));
      notifications.show({ color: data.result.success ? "green" : "yellow", message: data.result.message });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginTesting((current) => ({ ...current, [plugin]: false }));
    }
  };

  const deleteSubtitleTemplate = async (id: string) => {
    setSubtitleTemplateDeleting((current) => ({ ...current, [id]: true }));
    try {
      await apiRequest(`/api/admin/settings/subtitle-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSubtitleTemplates((current) => current.filter((item) => item.id !== id));
      notifications.show({ color: "green", message: t("settings.subtitleTemplateDeleted") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleTemplateDeleting((current) => ({ ...current, [id]: false }));
    }
  };

  const openCreateSubtitleModal = () => {
    setSubtitleModalMode("create");
    setSubtitleEditingId(null);
    setSubtitleForm({
      name: "",
      urlTemplate: "https://subhd.tv/search/{title}",
      enabled: true
    });
    setSubtitleModalOpened(true);
  };

  const openEditSubtitleModal = (template: SubtitleTemplate) => {
    setSubtitleModalMode("edit");
    setSubtitleEditingId(template.id);
    setSubtitleForm({
      name: template.name,
      urlTemplate: template.urlTemplate,
      enabled: template.enabled
    });
    setSubtitleModalOpened(true);
  };

  const submitSubtitleModal = async () => {
    setSubtitleModalSaving(true);
    try {
      const payload = {
        name: subtitleForm.name,
        urlTemplate: subtitleForm.urlTemplate,
        enabled: subtitleForm.enabled
      };

      if (subtitleModalMode === "create") {
        const data = await apiRequest<SubtitleTemplateResponse>("/api/admin/settings/subtitle-templates", {
          method: "POST",
          data: payload
        });
        setSubtitleTemplates((current) => [...current, data.template]);
        notifications.show({ color: "green", message: t("settings.subtitleTemplateCreated") });
      } else {
        const templateId = subtitleEditingId || "";
        if (!templateId) {
          throw new Error(t("settings.subtitleTemplateEditTargetMissing"));
        }
        const data = await apiRequest<SubtitleTemplateResponse>(`/api/admin/settings/subtitle-templates/${encodeURIComponent(templateId)}`, {
          method: "PUT",
          data: payload
        });
        setSubtitleTemplates((current) => current.map((item) => (item.id === templateId ? data.template : item)));
        notifications.show({ color: "green", message: t("settings.subtitleTemplateSaved") });
      }

      setSubtitleModalOpened(false);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleModalSaving(false);
    }
  };

  const renderPluginResult = (plugin: "tmdb" | "imdb" | "douban") => {
    const result = pluginResults[plugin];
    if (!result) return null;
    return (
      <ScrollArea className="settings-plugin-test-scroll" h={320} type="auto" scrollbarSize={8}>
        <pre className="settings-plugin-test-content">{JSON.stringify(result, null, 2)}</pre>
      </ScrollArea>
    );
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

  const applyPerformancePreset = (preset: PerformancePresetKey) => {
    const next = PERFORMANCE_PRESETS[preset];
    setSettings((current) => ({
      ...current,
      performance: {
        dht: { ...next.dht },
        queue: { ...next.queue },
        media: { ...next.media }
      }
    }));
    notifications.show({
      color: "green",
      message: `${t("settings.performancePresetApplied")} ${t(`settings.performancePresetOptions.${preset}`)}`
    });
  };

  const renderPerformanceLabel = (label: string, impact: string) => (
    <Group gap={6} wrap="nowrap">
      <span>{label}</span>
      <Tooltip label={impact} withArrow multiline maw={340}>
        <ActionIcon
          size={18}
          radius="xl"
          variant="subtle"
          color="gray"
          aria-label={t("settings.performanceImpactAria")}
        >
          <CircleHelp size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );

  const formatRuntimeCheckedAt = (value: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const renderRuntimeValue = (value: string) => {
    const maxLength = 72;
    if (value.length <= maxLength) {
      return <Text className="settings-runtime-value">{value}</Text>;
    }
    const truncated = `${value.slice(0, maxLength - 1)}…`;
    return (
      <Tooltip label={value} withArrow multiline maw={560}>
        <Text className="settings-runtime-value settings-runtime-value-truncated">{truncated}</Text>
      </Tooltip>
    );
  };

  if (authLoading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Card className="glass-card" withBorder maw={560} mx="auto">
        <Stack>
          <Title order={2}>{t("auth.adminOnly")}</Title>
          <Text c="dimmed">{t("auth.adminOnlyDesc")}</Text>
          <Button leftSection={<LogIn size={15} />} w="fit-content" onClick={openLogin}>
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
            <Text c="dimmed">{t("settings.subtitle")}</Text>
          </Stack>
          <Group>
            <Tooltip label={t("common.refresh")} withArrow>
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => {
                  void loadSettings();
                  void loadRuntimeStatus();
                  void loadSubtitleTemplates();
                }}
                aria-label={t("common.refresh")}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("settings.save")} withArrow>
              <ActionIcon
                variant="light"
                size="lg"
                loading={saving}
                onClick={() => void saveSettings()}
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
            <Tabs.Tab value="plugins">{t("settings.tabSitePlugins")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="performance" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.performanceTitle")}</Title>
              <Text c="dimmed" size="sm">{t("settings.performanceHint")}</Text>

              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap={2}>
                      <Title order={5}>{t("settings.runtimeStatusTitle")}</Title>
                      <Text c="dimmed" size="sm">{t("settings.runtimeStatusHint")}</Text>
                    </Stack>
                    <Button size="xs" variant="default" loading={runtimeStatusLoading} onClick={() => void loadRuntimeStatus()}>
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
                        <Group gap={8} className="settings-runtime-worker-list">
                          {runtimeStatus.workers.map((worker) => (
                            <Card key={worker.key} className="settings-runtime-worker-item" p="xs" radius="md">
                              <Stack gap={6}>
                                <Text className="settings-runtime-worker-key">{worker.key}</Text>
                                <Group gap={6}>
                                  <Badge size="sm" variant="light" color={worker.enabled ? "teal" : "gray"}>
                                    {t("settings.runtimeStatusEnabledLabel")}: {worker.enabled ? t("common.yes") : t("common.no")}
                                  </Badge>
                                  <Badge size="sm" variant="light" color={worker.started ? "green" : "yellow"}>
                                    {t("settings.runtimeStatusStartedLabel")}: {worker.started ? t("common.yes") : t("common.no")}
                                  </Badge>
                                </Group>
                              </Stack>
                            </Card>
                          ))}
                        </Group>
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

              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Title order={5}>{t("settings.performancePresetTitle")}</Title>
                  <Text c="dimmed" size="sm">{t("settings.performancePresetHint")}</Text>
                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    {(["resource", "realtime", "throughput"] as PerformancePresetKey[]).map((preset) => (
                      <Card key={preset} className="settings-preset-card" radius="md" p="sm">
                        <Stack gap={8}>
                          <Text fw={700}>{t(`settings.performancePresetOptions.${preset}`)}</Text>
                          <Text size="sm" c="dimmed">{t(`settings.performancePresetDescriptions.${preset}`)}</Text>
                          <Button size="xs" variant="light" onClick={() => applyPerformancePreset(preset)}>
                            {t("settings.performancePresetApply")}
                          </Button>
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>
                </Stack>
              </Card>

              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Title order={5}>{t("settings.performanceDhtTitle")}</Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtScalingFactor"), t("settings.performanceImpact.dhtScalingFactor"))}
                      min={1}
                      max={200}
                      value={settings.performance.dht.scalingFactor}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          updateDHTPerformance({ scalingFactor: value });
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
                          updateDHTPerformance({ reseedIntervalSeconds: value });
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
                          updateDHTPerformance({ saveFilesThreshold: value });
                        }
                      }}
                    />
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.dhtSavePieces"), t("settings.performanceImpact.dhtSavePieces"))}
                      </div>
                      <Switch
                        checked={settings.performance.dht.savePieces}
                        onChange={(event) => updateDHTPerformance({ savePieces: event.currentTarget.checked })}
                      />
                    </Stack>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.dhtRescrapeThresholdHours"), t("settings.performanceImpact.dhtRescrapeThresholdHours"))}
                      min={1}
                      max={24 * 365}
                      value={settings.performance.dht.rescrapeThresholdHours}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          updateDHTPerformance({ rescrapeThresholdHours: value });
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
                          updateDHTPerformance({ statusLogIntervalSeconds: value });
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
                          updateDHTPerformance({ getOldestNodesIntervalSeconds: value });
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
                          updateDHTPerformance({ oldPeerThresholdMinutes: value });
                        }
                      }}
                    />
                  </SimpleGrid>
                </Stack>
              </Card>

              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Title order={5}>{t("settings.performanceMediaTitle")}</Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.mediaAutoCacheCover"), t("settings.performanceImpact.mediaAutoCacheCover"))}
                      </div>
                      <Switch
                        checked={settings.performance.media.autoCacheCover}
                        onChange={(event) => updateMediaPerformance({ autoCacheCover: event.currentTarget.checked })}
                      />
                    </Stack>
                    <Stack gap={6} className="settings-switch-field">
                      <div className="settings-switch-field-label">
                        {renderPerformanceLabel(t("settings.mediaAutoFetchBilingual"), t("settings.performanceImpact.mediaAutoFetchBilingual"))}
                      </div>
                      <Switch
                        checked={settings.performance.media.autoFetchBilingual}
                        onChange={(event) => updateMediaPerformance({ autoFetchBilingual: event.currentTarget.checked })}
                      />
                    </Stack>
                  </SimpleGrid>
                </Stack>
              </Card>

              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Title order={5}>{t("settings.performanceQueueTitle")}</Title>
                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    <NumberInput
                      label={renderPerformanceLabel(t("settings.queueProcessTorrentConcurrency"), t("settings.performanceImpact.queueProcessTorrentConcurrency"))}
                      min={1}
                      max={128}
                      value={settings.performance.queue.processTorrentConcurrency}
                      onChange={(value) => {
                        if (typeof value === "number" && Number.isFinite(value)) {
                          updateQueuePerformance({ processTorrentConcurrency: value });
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
                          updateQueuePerformance({ processTorrentCheckIntervalSeconds: value });
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
                          updateQueuePerformance({ processTorrentTimeoutSeconds: value });
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
                          updateQueuePerformance({ processTorrentBatchConcurrency: value });
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
                          updateQueuePerformance({ processTorrentBatchCheckIntervalSeconds: value });
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
                          updateQueuePerformance({ processTorrentBatchTimeoutSeconds: value });
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
                          updateQueuePerformance({ refreshMediaMetadataConcurrency: value });
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
                          updateQueuePerformance({ refreshMediaMetadataCheckIntervalSeconds: value });
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
                          updateQueuePerformance({ refreshMediaMetadataTimeoutSeconds: value });
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
                          updateQueuePerformance({ backfillCoverCacheConcurrency: value });
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
                          updateQueuePerformance({ backfillCoverCacheCheckIntervalSeconds: value });
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
                          updateQueuePerformance({ backfillCoverCacheTimeoutSeconds: value });
                        }
                      }}
                    />
                  </SimpleGrid>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="plugins" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.sitePluginTitle")}</Title>

              <Accordion className="settings-plugin-accordion" variant="separated" radius="lg">
                <Accordion.Item value="tmdb">
                  <Accordion.Control>TMDB</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Switch
                        label={t("settings.pluginTmdbEnabled")}
                        checked={settings.tmdbEnabled}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSettings((current) => ({ ...current, tmdbEnabled: checked }));
                        }}
                      />
                      <Group grow>
                        <TextInput
                          label={t("settings.testQuery")}
                          placeholder={t("settings.testQueryPlaceholder")}
                          value={pluginInputs.tmdb.query}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, query: value } }));
                          }}
                        />
                        <Select
                          label={t("settings.testContentType")}
                          value={pluginInputs.tmdb.contentType}
                          data={[
                            { value: "movie", label: t("contentTypes.movie") },
                            { value: "tv_show", label: t("contentTypes.tv_show") }
                          ]}
                          allowDeselect={false}
                          onChange={(value) => setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, contentType: value || "movie" } }))}
                        />
                        <TextInput
                          label={t("settings.testYear")}
                          placeholder="2026"
                          value={pluginInputs.tmdb.year}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, year: value } }));
                          }}
                        />
                      </Group>
                      <Group justify="flex-end">
                        <Button loading={Boolean(pluginTesting.tmdb)} onClick={() => void runPluginTest("tmdb")}>
                          {t("settings.testButton")}
                        </Button>
                      </Group>
                      {renderPluginResult("tmdb")}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="imdb">
                  <Accordion.Control>IMDb</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Switch
                        label={t("settings.pluginImdbEnabled")}
                        checked={settings.imdbEnabled}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSettings((current) => ({ ...current, imdbEnabled: checked }));
                        }}
                      />
                      <TextInput
                        label={t("settings.testIMDbID")}
                        placeholder="tt32252887"
                        value={pluginInputs.imdb.imdbId}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setPluginInputs((current) => ({ ...current, imdb: { ...current.imdb, imdbId: value } }));
                        }}
                      />
                      <Group justify="flex-end">
                        <Button loading={Boolean(pluginTesting.imdb)} onClick={() => void runPluginTest("imdb")}>
                          {t("settings.testButton")}
                        </Button>
                      </Group>
                      {renderPluginResult("imdb")}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="douban">
                  <Accordion.Control>Douban</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Switch
                        label={t("settings.doubanEnabled")}
                        checked={settings.doubanEnabled}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSettings((current) => ({ ...current, doubanEnabled: checked }));
                        }}
                      />

                      <Group grow>
                        <TextInput
                          label={t("settings.testTitle")}
                          placeholder={t("settings.testTitlePlaceholder")}
                          value={pluginInputs.douban.title}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPluginInputs((current) => ({ ...current, douban: { ...current.douban, title: value } }));
                          }}
                        />
                        <Select
                          label={t("settings.testContentType")}
                          value={pluginInputs.douban.contentType}
                          data={[
                            { value: "movie", label: t("contentTypes.movie") },
                            { value: "tv_show", label: t("contentTypes.tv_show") }
                          ]}
                          allowDeselect={false}
                          onChange={(value) =>
                            setPluginInputs((current) => ({ ...current, douban: { ...current.douban, contentType: value || "movie" } }))
                          }
                        />
                        <TextInput
                          label={t("settings.testYear")}
                          placeholder="2026"
                          value={pluginInputs.douban.year}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPluginInputs((current) => ({ ...current, douban: { ...current.douban, year: value } }));
                          }}
                        />
                      </Group>

                      <NumberInput
                        label={t("settings.doubanMinScore")}
                        value={settings.doubanMinScore}
                        min={0}
                        max={1}
                        step={0.01}
                        decimalScale={2}
                        onChange={(value) =>
                          setSettings((current) => ({
                            ...current,
                            doubanMinScore: typeof value === "number" && Number.isFinite(value) ? value : current.doubanMinScore
                          }))
                        }
                      />
                      <Textarea
                        label={t("settings.doubanCookie")}
                        minRows={4}
                        autosize
                        value={settings.doubanCookie}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSettings((current) => ({ ...current, doubanCookie: value }));
                        }}
                      />
                      <TextInput
                        label={t("settings.doubanUserAgent")}
                        value={settings.doubanUserAgent}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSettings((current) => ({ ...current, doubanUserAgent: value }));
                        }}
                      />
                      <TextInput
                        label={t("settings.doubanAcceptLanguage")}
                        value={settings.doubanAcceptLanguage}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSettings((current) => ({ ...current, doubanAcceptLanguage: value }));
                        }}
                      />
                      <TextInput
                        label={t("settings.doubanReferer")}
                        value={settings.doubanReferer}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSettings((current) => ({ ...current, doubanReferer: value }));
                        }}
                      />
                      <Group justify="flex-end">
                        <Button loading={Boolean(pluginTesting.douban)} onClick={() => void runPluginTest("douban")}>
                          {t("settings.testButton")}
                        </Button>
                      </Group>
                      {renderPluginResult("douban")}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <Stack gap="sm">
                <Group justify="space-between" align="flex-end">
                  <div>
                    <Title order={5}>{t("settings.subtitleTemplateTitle")}</Title>
                    <Text c="dimmed" size="sm">{t("settings.subtitleTemplateHint")}</Text>
                  </div>
                  <Button leftSection={<Plus size={14} />} onClick={openCreateSubtitleModal}>
                    {t("settings.subtitleTemplateAdd")}
                  </Button>
                </Group>

                {subtitleTemplatesLoading ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : subtitleTemplates.length === 0 ? (
                  <Text size="sm" c="dimmed">{t("settings.subtitleTemplateEmpty")}</Text>
                ) : (
                  <Card withBorder radius="lg" className="settings-subtitle-template-item">
                    <ScrollArea type="auto" scrollbarSize={8}>
                      <Table striped withTableBorder highlightOnHover miw={760}>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t("settings.subtitleTemplateName")}</Table.Th>
                            <Table.Th>{t("settings.subtitleTemplateURL")}</Table.Th>
                            <Table.Th>{t("settings.subtitleTemplateEnabled")}</Table.Th>
                            <Table.Th>{t("settings.subtitleTemplateActions")}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {subtitleTemplates.map((template) => (
                            <Table.Tr key={template.id}>
                              <Table.Td>{template.name || "-"}</Table.Td>
                              <Table.Td>
                                <Text size="sm" lineClamp={1} title={template.urlTemplate}>
                                  {template.urlTemplate}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge color={template.enabled ? "green" : "gray"} variant="light">
                                  {template.enabled ? t("settings.subtitleTemplateEnabledYes") : t("settings.subtitleTemplateEnabledNo")}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Group gap={6}>
                                  <ActionIcon
                                    variant="default"
                                    size={30}
                                    onClick={() => openEditSubtitleModal(template)}
                                    aria-label={t("settings.subtitleTemplateEdit")}
                                  >
                                    <Pencil size={14} />
                                  </ActionIcon>
                                  <ActionIcon
                                    color="red"
                                    variant="light"
                                    size={30}
                                    loading={Boolean(subtitleTemplateDeleting[template.id])}
                                    onClick={() => void deleteSubtitleTemplate(template.id)}
                                    aria-label={t("settings.subtitleTemplateDelete")}
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
                )}
              </Stack>
            </Stack>
          </Tabs.Panel>
        </Tabs>

      </Card>

      <Modal
        opened={subtitleModalOpened}
        onClose={() => {
          if (!subtitleModalSaving) {
            setSubtitleModalOpened(false);
          }
        }}
        title={subtitleModalMode === "create" ? t("settings.subtitleTemplateCreate") : t("settings.subtitleTemplateEdit")}
        centered
      >
        <Stack gap="sm">
          <TextInput
            label={t("settings.subtitleTemplateName")}
            placeholder={t("settings.subtitleTemplateNamePlaceholder")}
            value={subtitleForm.name}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSubtitleForm((current) => ({ ...current, name: value }));
            }}
          />
          <TextInput
            label={t("settings.subtitleTemplateURL")}
            placeholder="https://subhd.tv/search/{title}"
            value={subtitleForm.urlTemplate}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSubtitleForm((current) => ({ ...current, urlTemplate: value }));
            }}
          />
          <Switch
            label={t("settings.subtitleTemplateEnabled")}
            checked={subtitleForm.enabled}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setSubtitleForm((current) => ({ ...current, enabled: checked }));
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSubtitleModalOpened(false)} disabled={subtitleModalSaving}>
              {t("common.cancel")}
            </Button>
            <Button loading={subtitleModalSaving} onClick={() => void submitSubtitleModal()}>
              {subtitleModalMode === "create" ? t("settings.subtitleTemplateAdd") : t("settings.subtitleTemplateSave")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function parseYear(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const year = Number(trimmed);
  if (!Number.isFinite(year) || year <= 0) return undefined;
  return Math.trunc(year);
}

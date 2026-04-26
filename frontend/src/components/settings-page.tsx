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
  TagsInput,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { CircleHelp, LogIn, Pencil, Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
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
      warmupTimeoutSeconds: number;
    };
  };
  home: {
    daily: {
      refreshHour: number;
      poolLimit: number;
    };
    hot: {
      days: number;
    };
    highScore: {
      poolLimit: number;
      minScore: number;
      maxScore: number;
      window: number;
    };
  };
  player: {
    enabled: boolean;
    metadataTimeoutSeconds: number;
    hardTimeoutSeconds: number;
    transmission: {
      enabled: boolean;
      url: string;
      localDownloadDir: string;
      downloadMappingDirectory: string;
      downloadVideoFormats: string[];
      username: string;
      password: string;
      insecureTls: boolean;
      timeoutSeconds: number;
      sequentialDownload: boolean;
      autoCleanupEnabled: boolean;
      autoCleanupSlowTaskEnabled: boolean;
      autoCleanupStorageEnabled: boolean;
      autoCleanupMaxTasks: number;
      autoCleanupMaxTotalSizeGB: number;
      autoCleanupMinFreeSpaceGB: number;
      autoCleanupSlowWindowMinutes: number;
      autoCleanupSlowRateKbps: number;
    };
    ffmpeg: {
      enabled: boolean;
      binaryPath: string;
      preset: string;
      crf: number;
      audioBitrateKbps: number;
      threads: number;
      extraArgs: string;
    };
  };
  auth: {
    membershipEnabled: boolean;
    registrationEnabled: boolean;
    inviteRequired: boolean;
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

type WorkerRestartResponse = {
  ok: boolean;
  report?: {
    elapsed?: string | number;
    workers?: Array<{
      key?: string;
      phases?: Array<{
        name?: string;
        status?: string;
        elapsed?: string | number;
      }>;
    }>;
  };
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

type TransmissionConnectivityResult = {
  success: boolean;
  message: string;
  url: string;
  latencyMs: number;
  rpcVersion: number;
  rpcVersionMin: number;
  version: string;
  downloadDir: string;
  localDownloadDir?: string;
  localDownloadDirExists?: boolean;
  localDownloadDirIsDir?: boolean;
  localDownloadDirReadable?: boolean;
  localDownloadDirEntries?: number;
  localDownloadDirError?: string;
  downloadMapping?: DownloadMappingConnectivityResult;
};

type TransmissionConnectivityResponse = {
  result: TransmissionConnectivityResult;
};

type DownloadMappingConnectivityResult = {
  success: boolean;
  message: string;
  mode: "directory";
  latencyMs: number;
  directory?: string;
  directoryExists?: boolean;
  directoryIsDir?: boolean;
  directoryReadable?: boolean;
  directoryEntries?: number;
  directoryError?: string;
};

type DownloadMappingConnectivityResponse = {
  result: DownloadMappingConnectivityResult;
};

type TransmissionTaskStats = {
  taskCount: number;
  totalSizeBytes: number;
  freeSpaceBytes: number;
  freeSpaceAvailable: boolean;
};

type TransmissionTaskStatsResponse = {
  stats: TransmissionTaskStats;
};

type FFmpegConnectivityResult = {
  success: boolean;
  message: string;
  binaryPath: string;
  latencyMs: number;
  version: string;
  argsPreview: string;
  encodeMode: string;
};

type FFmpegConnectivityResponse = {
  result: FFmpegConnectivityResult;
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
      autoFetchBilingual: false,
      warmupTimeoutSeconds: 120
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
      autoFetchBilingual: true,
      warmupTimeoutSeconds: 90
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
      autoFetchBilingual: true,
      warmupTimeoutSeconds: 150
    }
  }
};

const DEFAULT_PLAYER_SETTINGS: SystemSettings["player"] = {
  enabled: true,
  metadataTimeoutSeconds: 25,
  hardTimeoutSeconds: 45,
  transmission: {
    enabled: true,
    url: "http://127.0.0.1:9091/transmission/rpc",
    localDownloadDir: "",
    downloadMappingDirectory: "",
    downloadVideoFormats: [
      ".mp4",
      ".m4v",
      ".webm",
      ".mkv",
      ".mov",
      ".avi",
      ".flv",
      ".ts",
      ".m2ts",
      ".mpeg",
      ".mpg",
      ".wmv",
      ".asf",
      ".3gp",
      ".3g2",
      ".f4v",
      ".rm",
      ".rmvb",
      ".vob",
      ".mxf",
      ".divx",
      ".xvid"
    ],
    username: "",
    password: "",
    insecureTls: false,
    timeoutSeconds: 8,
    sequentialDownload: true,
    autoCleanupEnabled: false,
    autoCleanupSlowTaskEnabled: true,
    autoCleanupStorageEnabled: true,
    autoCleanupMaxTasks: 60,
    autoCleanupMaxTotalSizeGB: 100,
    autoCleanupMinFreeSpaceGB: 20,
    autoCleanupSlowWindowMinutes: 30,
    autoCleanupSlowRateKbps: 100
  },
  ffmpeg: {
    enabled: true,
    binaryPath: "ffmpeg",
    preset: "veryfast",
    crf: 23,
    audioBitrateKbps: 128,
    threads: 0,
    extraArgs: ""
  }
};

const DEFAULT_AUTH_SETTINGS: SystemSettings["auth"] = {
  membershipEnabled: false,
  registrationEnabled: true,
  inviteRequired: false
};

const DEFAULT_HOME_SETTINGS: SystemSettings["home"] = {
  daily: {
    refreshHour: 2,
    poolLimit: 96
  },
  hot: {
    days: 30
  },
  highScore: {
    poolLimit: 120,
    minScore: 8,
    maxScore: 9.9,
    window: 1
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
  const [workerRestarting, setWorkerRestarting] = useState<Record<string, boolean>>({});
  const [initialSettings, setInitialSettings] = useState<SystemSettings | null>(null);
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
        autoFetchBilingual: true,
        warmupTimeoutSeconds: 90
      }
    },
    home: {
      ...DEFAULT_HOME_SETTINGS
    },
    player: { ...DEFAULT_PLAYER_SETTINGS },
    auth: { ...DEFAULT_AUTH_SETTINGS }
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
  const [transmissionTesting, setTransmissionTesting] = useState(false);
  const [downloadMappingTesting, setDownloadMappingTesting] = useState(false);
  const [transmissionTestResult, setTransmissionTestResult] = useState<TransmissionConnectivityResult | null>(null);
  const [downloadMappingTestResult, setDownloadMappingTestResult] = useState<DownloadMappingConnectivityResult | null>(null);
  const [transmissionTaskStats, setTransmissionTaskStats] = useState<TransmissionTaskStats | null>(null);
  const [transmissionTaskStatsLoading, setTransmissionTaskStatsLoading] = useState(false);
  const [ffmpegTesting, setFFmpegTesting] = useState(false);
  const [ffmpegTestResult, setFFmpegTestResult] = useState<FFmpegConnectivityResult | null>(null);
  const [subtitleForm, setSubtitleForm] = useState({
    name: "",
    urlTemplate: "https://subhd.tv/search/{title}",
    enabled: true
  });
  const tabsRef = useTabsUnderline();

  const resolvePlayerEnabled = useCallback((value: unknown, fallback: boolean) => {
    return typeof value === "boolean" ? value : fallback;
  }, []);

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await apiRequest<SettingsResponse>("/api/admin/settings");
      const playerEnabled = resolvePlayerEnabled(data.settings.player?.enabled, DEFAULT_PLAYER_SETTINGS.enabled);
      const normalized: SystemSettings = {
        ...data.settings,
        player: {
          ...DEFAULT_PLAYER_SETTINGS,
          ...data.settings.player,
          enabled: playerEnabled,
          transmission: {
            ...DEFAULT_PLAYER_SETTINGS.transmission,
            ...data.settings.player?.transmission,
            enabled: playerEnabled,
            downloadVideoFormats: normalizeVideoFormatTags(
              data.settings.player?.transmission?.downloadVideoFormats ?? DEFAULT_PLAYER_SETTINGS.transmission.downloadVideoFormats
            ),
            downloadMappingDirectory:
              data.settings.player?.transmission?.downloadMappingDirectory ??
              data.settings.player?.transmission?.localDownloadDir ??
              DEFAULT_PLAYER_SETTINGS.transmission.downloadMappingDirectory,
            localDownloadDir:
              data.settings.player?.transmission?.localDownloadDir ??
              data.settings.player?.transmission?.downloadMappingDirectory ??
              DEFAULT_PLAYER_SETTINGS.transmission.localDownloadDir
          },
          ffmpeg: {
            ...DEFAULT_PLAYER_SETTINGS.ffmpeg,
            ...data.settings.player?.ffmpeg,
            enabled: playerEnabled
          }
        },
        auth: {
          ...DEFAULT_AUTH_SETTINGS,
          ...data.settings.auth
        },
        home: {
          ...DEFAULT_HOME_SETTINGS,
          ...data.settings.home,
          daily: {
            ...DEFAULT_HOME_SETTINGS.daily,
            ...data.settings.home?.daily
          },
          hot: {
            ...DEFAULT_HOME_SETTINGS.hot,
            ...data.settings.home?.hot
          },
          highScore: {
            ...DEFAULT_HOME_SETTINGS.highScore,
            ...data.settings.home?.highScore
          }
        }
      };
      setSettings(normalized);
      setInitialSettings(normalized);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, resolvePlayerEnabled]);

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
    const payload = buildSettingsUpdatePayload(settings, initialSettings);
    if (Object.keys(payload).length === 0) {
      notifications.show({ color: "blue", message: t("settings.noChanges") });
      return;
    }

    setSaving(true);
    try {
      const data = await apiRequest<SettingsResponse>("/api/admin/settings", { method: "PUT", data: payload });
      const playerEnabled = resolvePlayerEnabled(data.settings.player?.enabled, settings.player.enabled);
      const normalized: SystemSettings = {
        ...data.settings,
        player: {
          ...DEFAULT_PLAYER_SETTINGS,
          ...data.settings.player,
          enabled: playerEnabled,
          transmission: {
            ...DEFAULT_PLAYER_SETTINGS.transmission,
            ...data.settings.player?.transmission,
            enabled: playerEnabled,
            downloadVideoFormats: normalizeVideoFormatTags(
              data.settings.player?.transmission?.downloadVideoFormats ?? DEFAULT_PLAYER_SETTINGS.transmission.downloadVideoFormats
            ),
            downloadMappingDirectory:
              data.settings.player?.transmission?.downloadMappingDirectory ??
              data.settings.player?.transmission?.localDownloadDir ??
              DEFAULT_PLAYER_SETTINGS.transmission.downloadMappingDirectory,
            localDownloadDir:
              data.settings.player?.transmission?.localDownloadDir ??
              data.settings.player?.transmission?.downloadMappingDirectory ??
              DEFAULT_PLAYER_SETTINGS.transmission.localDownloadDir
          },
          ffmpeg: {
            ...DEFAULT_PLAYER_SETTINGS.ffmpeg,
            ...data.settings.player?.ffmpeg,
            enabled: playerEnabled
          }
        },
        auth: {
          ...DEFAULT_AUTH_SETTINGS,
          ...data.settings.auth
        },
        home: {
          ...DEFAULT_HOME_SETTINGS,
          ...data.settings.home,
          daily: {
            ...DEFAULT_HOME_SETTINGS.daily,
            ...data.settings.home?.daily
          },
          hot: {
            ...DEFAULT_HOME_SETTINGS.hot,
            ...data.settings.home?.hot
          },
          highScore: {
            ...DEFAULT_HOME_SETTINGS.highScore,
            ...data.settings.home?.highScore
          }
        }
      };
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

  const updateHomeSettings = (
    updates: {
      daily?: Partial<SystemSettings["home"]["daily"]>;
      hot?: Partial<SystemSettings["home"]["hot"]>;
      highScore?: Partial<SystemSettings["home"]["highScore"]>;
    }
  ) => {
    setSettings((current) => ({
      ...current,
      home: {
        daily: {
          ...current.home.daily,
          ...(updates.daily || {})
        },
        hot: {
          ...current.home.hot,
          ...(updates.hot || {})
        },
        highScore: {
          ...current.home.highScore,
          ...(updates.highScore || {})
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

  const updateAuthSettings = (updates: Partial<SystemSettings["auth"]>) => {
    setSettings((current) => ({
      ...current,
      auth: {
        ...current.auth,
        ...updates
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
    setTransmissionTaskStatsLoading(true);
    try {
      const data = await apiRequest<TransmissionTaskStatsResponse>("/api/admin/settings/player/transmission/tasks/stats");
      setTransmissionTaskStats(data.stats || null);
    } catch {
      setTransmissionTaskStats(null);
    } finally {
      setTransmissionTaskStatsLoading(false);
    }
  }, [isAdmin, resolvePlayerEnabled]);

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
          className="app-icon-btn"
          size={18}
          radius="xl"
          variant="subtle"
          color="slate"
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

  const prettifyGoDuration = (raw?: string | number) => {
    if (raw === undefined || raw === null) return "-";
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const milliseconds = raw / 1_000_000;
      if (milliseconds < 1000) {
        return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`;
      }
      const seconds = milliseconds / 1000;
      return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
    }
    const text = String(raw).trim();
    if (!text) return "-";
    return text
      .replace(/µs/g, "us")
      .replace(/h/g, "h ")
      .replace(/m(?!s)/g, "m ")
      .replace(/s/g, "s ")
      .trim();
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

  const workerDetails = (key: string) => {
    if (key === "queue_server") {
      return {
        kind: t("settings.workerKindQueue"),
        scope: "system.performance.queue.*",
        desc: t("settings.workerDescQueue")
      };
    }
    if (key === "dht_crawler") {
      return {
        kind: t("settings.workerKindDht"),
        scope: "system.performance.dht.*",
        desc: t("settings.workerDescDht")
      };
    }
    if (key === "web_server") {
      return {
        kind: t("settings.workerKindWeb"),
        scope: "system.*",
        desc: t("settings.workerDescWeb")
      };
    }
    return {
      kind: t("settings.workerKindGeneric"),
      scope: "-",
      desc: t("settings.workerDescGeneric")
    };
  };

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
            <Text c="dimmed" className="page-subtitle">{t("settings.subtitle")}</Text>
          </Stack>
          <Group>
            <Tooltip label={t("common.refresh")} withArrow>
              <ActionIcon
                className="app-icon-btn spin-on-active"
                data-spinning={runtimeStatusLoading || loading ? "true" : "false"}
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
                className="app-icon-btn"
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
            <Tabs.Tab value="content">{t("settings.tabContent")}</Tabs.Tab>
            <Tabs.Tab value="access">{t("settings.tabAccess")}</Tabs.Tab>
            <Tabs.Tab value="player">{t("settings.tabPlayer")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="performance" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.performanceTitle")}</Title>
              <Text c="dimmed" size="sm">{t("settings.performanceHint")}</Text>

              <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
                <Accordion.Item value="perf-runtime">
                  <Accordion.Control>{t("settings.runtimeStatusTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Card className="settings-section-block" radius="lg">
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                          <Text c="dimmed" size="sm">{t("settings.runtimeStatusHint")}</Text>
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
                                              onClick={() => void restartWorker(worker.key)}
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
                                        <Text size="xs" c="dimmed" lineClamp={1} title={workerDetails(worker.key).desc}>{workerDetails(worker.key).desc}</Text>
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
                                <Button size="xs" variant="light" onClick={() => applyPerformancePreset(preset)}>
                                  {t("settings.performancePresetApply")}
                                </Button>
                              </Stack>
                            </Card>
                          ))}
                        </SimpleGrid>
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
                          <NumberInput
                            label={renderPerformanceLabel(t("settings.mediaWarmupTimeoutSeconds"), t("settings.performanceImpact.mediaWarmupTimeoutSeconds"))}
                            min={5}
                            max={7200}
                            value={settings.performance.media.warmupTimeoutSeconds}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateMediaPerformance({ warmupTimeoutSeconds: value });
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
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="content" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.homeTitle")}</Title>
              <Text c="dimmed" size="sm">{t("settings.homeHint")}</Text>

              <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
                <Accordion.Item value="home-daily">
                  <Accordion.Control>{t("settings.homeDailyTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Card className="settings-section-block" radius="lg">
                      <Stack gap="sm">
                        <Text c="dimmed" size="sm">{t("settings.homeDailyHint")}</Text>
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                          <NumberInput
                            label={t("settings.homeDailyRefreshHour")}
                            min={0}
                            max={23}
                            value={settings.home.daily.refreshHour}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ daily: { refreshHour: value } });
                              }
                            }}
                          />
                          <NumberInput
                            label={t("settings.homeDailyPoolLimit")}
                            min={24}
                            max={240}
                            value={settings.home.daily.poolLimit}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ daily: { poolLimit: value } });
                              }
                            }}
                          />
                        </SimpleGrid>
                      </Stack>
                    </Card>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="home-hot">
                  <Accordion.Control>{t("settings.homeHotTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Card className="settings-section-block" radius="lg">
                      <Stack gap="sm">
                        <Text c="dimmed" size="sm">{t("settings.homeHotHint")}</Text>
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                          <NumberInput
                            label={t("settings.homeHotDays")}
                            min={1}
                            max={3650}
                            value={settings.home.hot.days}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ hot: { days: value } });
                              }
                            }}
                          />
                        </SimpleGrid>
                      </Stack>
                    </Card>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="home-highscore">
                  <Accordion.Control>{t("settings.homeHighScoreTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Card className="settings-section-block" radius="lg">
                      <Stack gap="sm">
                        <Text c="dimmed" size="sm">{t("settings.homeHighScoreHint")}</Text>
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                          <NumberInput
                            label={t("settings.homeHighScorePoolLimit")}
                            min={24}
                            max={240}
                            value={settings.home.highScore.poolLimit}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ highScore: { poolLimit: value } });
                              }
                            }}
                          />
                          <NumberInput
                            label={t("settings.homeHighScoreMin")}
                            min={0}
                            max={10}
                            step={0.1}
                            decimalScale={1}
                            value={settings.home.highScore.minScore}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ highScore: { minScore: value } });
                              }
                            }}
                          />
                          <NumberInput
                            label={t("settings.homeHighScoreMax")}
                            min={0}
                            max={10}
                            step={0.1}
                            decimalScale={1}
                            value={settings.home.highScore.maxScore}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ highScore: { maxScore: value } });
                              }
                            }}
                          />
                          <NumberInput
                            label={t("settings.homeHighScoreWindow")}
                            min={0.1}
                            max={10}
                            step={0.1}
                            decimalScale={1}
                            value={settings.home.highScore.window}
                            onChange={(value) => {
                              if (typeof value === "number" && Number.isFinite(value)) {
                                updateHomeSettings({ highScore: { window: value } });
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

          <Tabs.Panel value="access" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.accessTitle")}</Title>
              <Text c="dimmed" size="sm">{t("settings.accessHint")}</Text>
              <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
                <Accordion.Item value="access-membership">
                  <Accordion.Control>{t("settings.accessMembershipTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Card className="settings-section-block" radius="lg">
                      <Stack gap="sm">
                        <Switch
                          label={t("settings.authMembershipEnabled")}
                          checked={settings.auth.membershipEnabled}
                          onChange={(event) => updateAuthSettings({ membershipEnabled: event.currentTarget.checked })}
                        />
                        <Switch
                          label={t("settings.authRegistrationEnabled")}
                          checked={settings.auth.registrationEnabled}
                          onChange={(event) => updateAuthSettings({ registrationEnabled: event.currentTarget.checked })}
                        />
                        {settings.auth.registrationEnabled ? (
                          <div className="settings-toggle-panel">
                            <Switch
                              label={t("settings.authInviteRequired")}
                              checked={settings.auth.inviteRequired}
                              onChange={(event) => updateAuthSettings({ inviteRequired: event.currentTarget.checked })}
                            />
                          </div>
                        ) : null}
                      </Stack>
                    </Card>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="player" pt="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={2}>
                  <Title order={4}>{t("settings.playerTitle")}</Title>
                  <Text c="dimmed" size="sm">{t("settings.playerHint")}</Text>
                </Stack>
                <Button variant="default" size="xs" leftSection={<RotateCcw size={14} />} onClick={resetPlayerDefaults}>
                  {t("settings.playerResetDefaults")}
                </Button>
              </Group>
              <Card className="settings-section-block" radius="lg">
                <Switch
                  label={t("settings.playerEnabled")}
                  checked={settings.player.enabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
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
                />
              </Card>

              {settings.player.enabled ? (
                <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
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
                                    updatePlayerSettings({
                                      metadataTimeoutSeconds: value,
                                      hardTimeoutSeconds: value
                                    });
                                    return;
                                  }
                                  updatePlayerSettings({ metadataTimeoutSeconds: value });
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
                                  updatePlayerSettings({ hardTimeoutSeconds: value });
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
                                <Button variant="default" size="xs" loading={downloadMappingTesting} onClick={() => void testDownloadMapping()}>
                                  {t("settings.playerDownloadMappingTestButton")}
                                </Button>
                                <Button variant="light" size="xs" loading={transmissionTesting} onClick={() => void testPlayerTransmission()}>
                                  {t("settings.playerTransmissionTestButton")}
                                </Button>
                              </Group>
                            </Group>
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                              <TextInput
                                label={t("settings.playerTransmissionUrl")}
                                value={settings.player.transmission.url}
                                onChange={(event) => {
                                  updatePlayerTransmissionSettings({ url: event.currentTarget.value });
                                }}
                              />
                              <NumberInput
                                label={t("settings.playerTransmissionTimeoutSeconds")}
                                min={2}
                                max={60}
                                value={settings.player.transmission.timeoutSeconds}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    updatePlayerTransmissionSettings({ timeoutSeconds: value });
                                  }
                                }}
                              />
                              <TextInput
                                label={t("settings.playerTransmissionUsername")}
                                value={settings.player.transmission.username}
                                onChange={(event) => {
                                  updatePlayerTransmissionSettings({ username: event.currentTarget.value });
                                }}
                              />
                              <TextInput
                                label={t("settings.playerTransmissionPassword")}
                                type="password"
                                value={settings.player.transmission.password}
                                onChange={(event) => {
                                  updatePlayerTransmissionSettings({ password: event.currentTarget.value });
                                }}
                              />
                            </SimpleGrid>
                            <TagsInput
                              label={t("settings.playerTransmissionDownloadVideoFormats")}
                              description={t("settings.playerTransmissionDownloadVideoFormatsHint")}
                              value={settings.player.transmission.downloadVideoFormats}
                              onChange={(value) => {
                                updatePlayerTransmissionSettings({ downloadVideoFormats: normalizeVideoFormatTags(value) });
                              }}
                              clearable
                              splitChars={[",", " ", ";", "\n", "\t"]}
                              placeholder=".mp4, .mkv, .webm"
                            />
                            <Card withBorder radius="md" p="sm" className="player-download-mapping-card">
                              <Stack gap="xs">
                                <TextInput
                                  label={t("settings.playerTransmissionLocalDownloadDir")}
                                  value={settings.player.transmission.downloadMappingDirectory}
                                  onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    updatePlayerTransmissionSettings({
                                      downloadMappingDirectory: value,
                                      localDownloadDir: value
                                    });
                                  }}
                                />
                              </Stack>
                            </Card>
                            <Switch
                              label={t("settings.playerTransmissionInsecureTls")}
                              checked={settings.player.transmission.insecureTls}
                              onChange={(event) => {
                                updatePlayerTransmissionSettings({ insecureTls: event.currentTarget.checked });
                              }}
                            />
                            <Switch
                              label={t("settings.playerTransmissionSequentialDownload")}
                              checked={settings.player.transmission.sequentialDownload}
                              onChange={(event) => {
                                updatePlayerTransmissionSettings({ sequentialDownload: event.currentTarget.checked });
                              }}
                            />
                            <Switch
                              label={t("settings.playerTransmissionAutoCleanupEnabled")}
                              checked={settings.player.transmission.autoCleanupEnabled}
                              onChange={(event) => {
                                updatePlayerTransmissionSettings({ autoCleanupEnabled: event.currentTarget.checked });
                              }}
                            />
                            {settings.player.transmission.autoCleanupEnabled ? (
                              <Stack gap="sm" className="settings-toggle-panel">
                                <Switch
                                  label={t("settings.playerTransmissionAutoCleanupSlowTaskEnabled")}
                                  checked={settings.player.transmission.autoCleanupSlowTaskEnabled}
                                  onChange={(event) => {
                                    updatePlayerTransmissionSettings({ autoCleanupSlowTaskEnabled: event.currentTarget.checked });
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
                                          updatePlayerTransmissionSettings({ autoCleanupSlowWindowMinutes: value });
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
                                          updatePlayerTransmissionSettings({ autoCleanupSlowRateKbps: value });
                                        }
                                      }}
                                    />
                                  </SimpleGrid>
                                ) : null}
                                <Switch
                                  label={t("settings.playerTransmissionAutoCleanupStorageEnabled")}
                                  checked={settings.player.transmission.autoCleanupStorageEnabled}
                                  onChange={(event) => {
                                    updatePlayerTransmissionSettings({ autoCleanupStorageEnabled: event.currentTarget.checked });
                                  }}
                                />
                                {settings.player.transmission.autoCleanupStorageEnabled ? (
                                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                                    <NumberInput
                                      label={t("settings.playerTransmissionAutoCleanupMaxTasks")}
                                      min={0}
                                      max={5000}
                                      value={settings.player.transmission.autoCleanupMaxTasks}
                                      onChange={(value) => {
                                        if (typeof value === "number" && Number.isFinite(value)) {
                                          updatePlayerTransmissionSettings({ autoCleanupMaxTasks: value });
                                        }
                                      }}
                                    />
                                    <NumberInput
                                      label={t("settings.playerTransmissionAutoCleanupMaxTotalSizeGB")}
                                      description={`${t("settings.playerTransmissionCurrentTotalSize")}: ${transmissionTaskStatsLoading
                                          ? t("common.loading")
                                          : formatGiBFromBytes(transmissionTaskStats?.totalSizeBytes)
                                        }`}
                                      min={0}
                                      max={32768}
                                      value={settings.player.transmission.autoCleanupMaxTotalSizeGB}
                                      onChange={(value) => {
                                        if (typeof value === "number" && Number.isFinite(value)) {
                                          updatePlayerTransmissionSettings({ autoCleanupMaxTotalSizeGB: value });
                                        }
                                      }}
                                    />
                                    <NumberInput
                                      label={t("settings.playerTransmissionAutoCleanupMinFreeSpaceGB")}
                                      description={`${t("settings.playerTransmissionCurrentFreeSpace")}: ${transmissionTaskStatsLoading
                                          ? t("common.loading")
                                          : transmissionTaskStats?.freeSpaceAvailable
                                            ? formatGiBFromBytes(transmissionTaskStats.freeSpaceBytes)
                                            : t("settings.playerTransmissionCurrentValueUnavailable")
                                        }`}
                                      min={0}
                                      max={8192}
                                      value={settings.player.transmission.autoCleanupMinFreeSpaceGB}
                                      onChange={(value) => {
                                        if (typeof value === "number" && Number.isFinite(value)) {
                                          updatePlayerTransmissionSettings({ autoCleanupMinFreeSpaceGB: value });
                                        }
                                      }}
                                    />
                                  </SimpleGrid>
                                ) : null}
                              </Stack>
                            ) : null}
                            {downloadMappingTestResult ? (
                              <Card withBorder radius="md" p="sm">
                                <Stack gap={6}>
                                  <Group gap={8}>
                                    <Badge color={downloadMappingTestResult.success ? "green" : "yellow"} variant="light">
                                      {downloadMappingTestResult.success ? t("settings.playerDownloadMappingTestSuccess") : t("settings.playerDownloadMappingTestFailed")}
                                    </Badge>
                                    <Text size="sm">{t("settings.playerTransmissionLatency")}: {downloadMappingTestResult.latencyMs}ms</Text>
                                  </Group>
                                  <Text size="sm">{t("settings.playerTransmissionMessage")}: {downloadMappingTestResult.message || "-"}</Text>
                                  <Text size="sm">{t("settings.playerTransmissionLocalDirProbe")}: {downloadMappingTestResult.directory || "-"}</Text>
                                  <Text size="sm">
                                    {t("settings.playerTransmissionLocalDirStatus")}: {String(Boolean(downloadMappingTestResult.directoryExists))} / {String(Boolean(downloadMappingTestResult.directoryIsDir))} / {String(Boolean(downloadMappingTestResult.directoryReadable))}
                                  </Text>
                                  <Text size="sm">{t("settings.playerTransmissionLocalDirEntries")}: {downloadMappingTestResult.directoryEntries ?? 0}</Text>
                                  <Text size="sm">{t("settings.playerTransmissionLocalDirError")}: {downloadMappingTestResult.directoryError || "-"}</Text>
                                </Stack>
                              </Card>
                            ) : null}
                            {transmissionTestResult ? (
                              <Card withBorder radius="md" p="sm">
                                <Stack gap={6}>
                                  <Group gap={8}>
                                    <Badge color={transmissionTestResult.success ? "green" : "yellow"} variant="light">
                                      {transmissionTestResult.success ? t("settings.playerTransmissionTestSuccess") : t("settings.playerTransmissionTestFailed")}
                                    </Badge>
                                    <Text size="sm">{t("settings.playerTransmissionLatency")}: {transmissionTestResult.latencyMs}ms</Text>
                                  </Group>
                                  <Text size="sm">{t("settings.playerTransmissionMessage")}: {transmissionTestResult.message || "-"}</Text>
                                  <Text size="sm" ff="monospace">{transmissionTestResult.url || "-"}</Text>
                                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                                    <Text size="sm">{t("settings.playerTransmissionVersion")}: {transmissionTestResult.version || "-"}</Text>
                                    <Text size="sm">{t("settings.playerTransmissionRpcVersion")}: {transmissionTestResult.rpcVersion || 0}</Text>
                                    <Text size="sm">{t("settings.playerTransmissionRpcVersionMin")}: {transmissionTestResult.rpcVersionMin || 0}</Text>
                                  </SimpleGrid>
                                  <Text size="sm">{t("settings.playerTransmissionDownloadDir")}: {transmissionTestResult.downloadDir || "-"}</Text>
                                  <Text size="sm">{t("settings.playerDownloadMappingModeLabel")}: {transmissionTestResult.downloadMapping?.mode || "-"}</Text>
                                  <Text size="sm">{t("settings.playerDownloadMappingSummary")}: {transmissionTestResult.downloadMapping?.message || "-"}</Text>
                                </Stack>
                              </Card>
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
                              <Button variant="light" size="xs" loading={ffmpegTesting} onClick={() => void testPlayerFFmpeg()}>
                                {t("settings.playerFfmpegTestButton")}
                              </Button>
                            </Group>
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                              <TextInput
                                label={t("settings.playerFfmpegBinaryPath")}
                                value={settings.player.ffmpeg.binaryPath}
                                onChange={(event) => {
                                  updatePlayerFFmpegSettings({ binaryPath: event.currentTarget.value });
                                }}
                              />
                              <TextInput
                                label={t("settings.playerFfmpegPreset")}
                                value={settings.player.ffmpeg.preset}
                                onChange={(event) => {
                                  updatePlayerFFmpegSettings({ preset: event.currentTarget.value });
                                }}
                              />
                              <NumberInput
                                label={t("settings.playerFfmpegCrf")}
                                min={16}
                                max={38}
                                value={settings.player.ffmpeg.crf}
                                onChange={(value) => {
                                  if (typeof value === "number" && Number.isFinite(value)) {
                                    updatePlayerFFmpegSettings({ crf: value });
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
                                    updatePlayerFFmpegSettings({ audioBitrateKbps: value });
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
                                    updatePlayerFFmpegSettings({ threads: value });
                                  }
                                }}
                              />
                              <TextInput
                                label={t("settings.playerFfmpegExtraArgs")}
                                value={settings.player.ffmpeg.extraArgs}
                                onChange={(event) => {
                                  updatePlayerFFmpegSettings({ extraArgs: event.currentTarget.value });
                                }}
                              />
                            </SimpleGrid>
                            {ffmpegTestResult ? (
                              <Card withBorder radius="md" p="sm">
                                <Stack gap={6}>
                                  <Group gap={8}>
                                    <Badge color={ffmpegTestResult.success ? "green" : "yellow"} variant="light">
                                      {ffmpegTestResult.success ? t("settings.playerFfmpegTestSuccess") : t("settings.playerFfmpegTestFailed")}
                                    </Badge>
                                    <Text size="sm">{t("settings.playerFfmpegLatency")}: {ffmpegTestResult.latencyMs}ms</Text>
                                  </Group>
                                  <Text size="sm">{t("settings.playerFfmpegMessage")}: {ffmpegTestResult.message || "-"}</Text>
                                  <Text size="sm">{t("settings.playerFfmpegVersion")}: {ffmpegTestResult.version || "-"}</Text>
                                  <Text size="sm">{t("settings.playerFfmpegBinaryPath")}: {ffmpegTestResult.binaryPath || "-"}</Text>
                                  <Text size="sm" ff="monospace">{ffmpegTestResult.argsPreview || "-"}</Text>
                                </Stack>
                              </Card>
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

          <Tabs.Panel value="content" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.sitePluginTitle")}</Title>

              <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
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
                      {settings.tmdbEnabled ? (
                        <Stack gap="sm" className="settings-toggle-panel">
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
                      ) : null}
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
                      {settings.imdbEnabled ? (
                        <Stack gap="sm" className="settings-toggle-panel">
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
                      ) : null}
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
                      {settings.doubanEnabled ? (
                        <Stack gap="sm" className="settings-toggle-panel">
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
                      ) : null}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <Accordion className="settings-sections-accordion" variant="separated" radius="lg" multiple defaultValue={[]}>
                <Accordion.Item value="subtitle-templates">
                  <Accordion.Control>{t("settings.subtitleTemplateTitle")}</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-end">
                        <div>
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
                                      <Badge color={template.enabled ? "green" : "slate"} variant="light">
                                        {template.enabled ? t("settings.subtitleTemplateEnabledYes") : t("settings.subtitleTemplateEnabledNo")}
                                      </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                      <Group gap={6}>
                                        <ActionIcon
                                          className="app-icon-btn"
                                          variant="default"
                                          size={30}
                                          onClick={() => openEditSubtitleModal(template)}
                                          aria-label={t("settings.subtitleTemplateEdit")}
                                        >
                                          <Pencil size={14} />
                                        </ActionIcon>
                                        <ActionIcon
                                          className="app-icon-btn"
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
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
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

function normalizeVideoFormatTags(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    let item = String(raw || "").trim().toLowerCase();
    if (!item) continue;
    item = item.replace(/^[*]+/, "");
    if (!item.startsWith(".")) {
      item = `.${item}`;
    }
    if (!/^\.[a-z0-9._-]{1,15}$/.test(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  result.sort();
  return result;
}

function areSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatGiBFromBytes(bytes?: number): string {
  if (!Number.isFinite(bytes) || Number(bytes) < 0) return "-";
  const gib = Number(bytes) / (1024 * 1024 * 1024);
  if (!Number.isFinite(gib)) return "-";
  return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`;
}

function buildSettingsUpdatePayload(
  current: SystemSettings,
  baseline: SystemSettings | null
): Record<string, unknown> {
  if (!baseline) {
    return {
      tmdbEnabled: current.tmdbEnabled,
      imdbEnabled: current.imdbEnabled,
      doubanEnabled: current.doubanEnabled,
      doubanMinScore: current.doubanMinScore,
      doubanCookie: current.doubanCookie,
      doubanUserAgent: current.doubanUserAgent,
      doubanAcceptLanguage: current.doubanAcceptLanguage,
      doubanReferer: current.doubanReferer,
      performance: current.performance,
      home: current.home,
      player: current.player,
      auth: current.auth
    };
  }

  const payload: Record<string, unknown> = {};
  if (current.tmdbEnabled !== baseline.tmdbEnabled) payload.tmdbEnabled = current.tmdbEnabled;
  if (current.imdbEnabled !== baseline.imdbEnabled) payload.imdbEnabled = current.imdbEnabled;
  if (current.doubanEnabled !== baseline.doubanEnabled) payload.doubanEnabled = current.doubanEnabled;
  if (current.doubanMinScore !== baseline.doubanMinScore) payload.doubanMinScore = current.doubanMinScore;
  if (current.doubanCookie !== baseline.doubanCookie) payload.doubanCookie = current.doubanCookie;
  if (current.doubanUserAgent !== baseline.doubanUserAgent) payload.doubanUserAgent = current.doubanUserAgent;
  if (current.doubanAcceptLanguage !== baseline.doubanAcceptLanguage) payload.doubanAcceptLanguage = current.doubanAcceptLanguage;
  if (current.doubanReferer !== baseline.doubanReferer) payload.doubanReferer = current.doubanReferer;
  if (!areSameValue(current.performance, baseline.performance)) payload.performance = current.performance;
  if (!areSameValue(current.home, baseline.home)) payload.home = current.home;
  if (!areSameValue(current.player, baseline.player)) payload.player = current.player;
  if (!areSameValue(current.auth, baseline.auth)) payload.auth = current.auth;
  return payload;
}

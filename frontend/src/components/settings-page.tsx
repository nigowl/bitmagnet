"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, RefreshCcw, Save } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/languages/provider";

type SystemSettings = {
  logLevel: string;
  tmdbEnabled: boolean;
  imdbEnabled: boolean;
  doubanEnabled: boolean;
  doubanMinScore: number;
  doubanCookie: string;
  doubanUserAgent: string;
  doubanAcceptLanguage: string;
  doubanReferer: string;
};

type SettingsResponse = {
  settings: SystemSettings;
};

type LogsResponse = {
  enabled: boolean;
  path: string;
  categories: Array<{ key: string }>;
  category: string;
  files: Array<{ name: string; sizeBytes: number; updatedAt: string }>;
  selectedFile?: string;
  updatedAt?: string;
  page: number;
  linesPerPage: number;
  totalPages: number;
  totalLines: number;
  lines: string[];
  message?: string;
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

type BackfillLocalizedResult = {
  requested: number;
  processed: number;
  updated: number;
  remaining: number;
  durationMs: number;
};

type BackfillLocalizedResponse = {
  result: BackfillLocalizedResult;
};

const LOG_LEVEL_OPTIONS = [
  { value: "DEBUG", label: "DEBUG" },
  { value: "INFO", label: "INFO" },
  { value: "WARNING", label: "WARNING" },
  { value: "ERROR", label: "ERROR" },
  { value: "CRITICAL", label: "CRITICAL" },
  { value: "ALERT", label: "ALERT" },
  { value: "EMERGENCY", label: "EMERGENCY" }
] as const;

const LOG_LINES_OPTIONS = [
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "500", label: "500" },
  { value: "1000", label: "1000" }
] as const;

export function SettingsPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    logLevel: "INFO",
    tmdbEnabled: true,
    imdbEnabled: true,
    doubanEnabled: true,
    doubanMinScore: 0.62,
    doubanCookie: "",
    doubanUserAgent: "",
    doubanAcceptLanguage: "",
    doubanReferer: ""
  });

  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshNonce, setLogsRefreshNonce] = useState(0);
  const [logsCategory, setLogsCategory] = useState("main");
  const [logsFile, setLogsFile] = useState("");
  const [logsPage, setLogsPage] = useState(1);
  const [logsLines, setLogsLines] = useState(200);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [pluginTesting, setPluginTesting] = useState<Record<string, boolean>>({});
  const [pluginResults, setPluginResults] = useState<Record<string, PluginTestResult | null>>({});
  const [backfillLimit, setBackfillLimit] = useState(200);
  const [backfilling, setBackfilling] = useState(false);
  const [pluginInputs, setPluginInputs] = useState({
    tmdb: { query: "", contentType: "movie", year: "" },
    imdb: { imdbId: "" },
    douban: { title: "", contentType: "movie", year: "" }
  });

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

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    const run = async () => {
      setLogsLoading(true);
      try {
        const query = new URLSearchParams({
          category: logsCategory,
          page: String(logsPage),
          lines: String(logsLines)
        });
        if (logsFile) {
          query.set("file", logsFile);
        }
        const data = await apiRequest<LogsResponse>(`/api/logs?${query.toString()}`);
        if (cancelled) return;

        setLogs(data);
        if (data.category && data.category !== logsCategory) {
          setLogsCategory(data.category);
        }
        const selectedFile = data.selectedFile || "";
        if (selectedFile !== logsFile) {
          setLogsFile(selectedFile);
        }
        if (data.page > 0 && data.page !== logsPage) {
          setLogsPage(data.page);
        }
      } catch (error) {
        if (cancelled) return;
        notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!cancelled) {
          setLogsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, logsCategory, logsFile, logsLines, logsPage, logsRefreshNonce]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        logLevel: settings.logLevel,
        tmdbEnabled: settings.tmdbEnabled,
        imdbEnabled: settings.imdbEnabled,
        doubanEnabled: settings.doubanEnabled,
        doubanMinScore: settings.doubanMinScore,
        doubanCookie: settings.doubanCookie,
        doubanUserAgent: settings.doubanUserAgent,
        doubanAcceptLanguage: settings.doubanAcceptLanguage,
        doubanReferer: settings.doubanReferer
      };
      const data = await apiRequest<SettingsResponse>("/api/admin/settings", { method: "PUT", data: payload });
      setSettings(data.settings);
      notifications.show({ color: "green", message: t("settings.saved") });
      setLogsRefreshNonce((current) => current + 1);
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

  const runLocalizedBackfill = async () => {
    setBackfilling(true);
    try {
      const data = await apiRequest<BackfillLocalizedResponse>("/api/admin/settings/media/backfill-localized", {
        method: "POST",
        data: { limit: backfillLimit }
      });
      notifications.show({
        color: "green",
        message: t("settings.backfillDone")
          .replace("{processed}", String(data.result.processed))
          .replace("{updated}", String(data.result.updated))
          .replace("{remaining}", String(data.result.remaining))
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBackfilling(false);
    }
  };

  const categoryOptions = useMemo(
    () =>
      (logs?.categories?.length ? logs.categories : [{ key: "main" }, { key: "dht" }, { key: "site_plugins" }]).map((item) => ({
        value: item.key,
        label: t(`settings.logCategory.${item.key}`)
      })),
    [logs?.categories, t]
  );

  const fileOptions = useMemo(
    () =>
      (logs?.files || []).map((item) => ({
        value: item.name,
        label: item.name
      })),
    [logs?.files]
  );

  const logContent = useMemo(() => {
    if (logs?.lines?.length) {
      return logs.lines.join("\n");
    }
    return logs?.message || t("settings.logsEmpty");
  }, [logs?.lines, logs?.message, t]);

  const renderPluginResult = (plugin: "tmdb" | "imdb" | "douban") => {
    const result = pluginResults[plugin];
    if (!result) return null;
    return (
      <ScrollArea className="settings-plugin-test-scroll">
        <pre className="settings-plugin-test-content">{JSON.stringify(result, null, 2)}</pre>
      </ScrollArea>
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
        <Stack gap={4}>
          <Title order={2}>{t("settings.title")}</Title>
          <Text c="dimmed">{t("settings.subtitle")}</Text>
        </Stack>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs defaultValue="logs">
          <Tabs.List>
            <Tabs.Tab value="logs">{t("settings.tabLogs")}</Tabs.Tab>
            <Tabs.Tab value="plugins">{t("settings.tabSitePlugins")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="logs" pt="md">
            <Stack gap="md">
              <Select
                label={t("settings.logLevel")}
                value={settings.logLevel}
                onChange={(value) => setSettings((current) => ({ ...current, logLevel: value || "INFO" }))}
                data={LOG_LEVEL_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                allowDeselect={false}
              />

              <Group grow className="settings-log-controls">
                <Select
                  label={t("settings.logCategoryLabel")}
                  value={logsCategory}
                  data={categoryOptions}
                  allowDeselect={false}
                  onChange={(value) => {
                    setLogsCategory(value || "main");
                    setLogsFile("");
                    setLogsPage(1);
                  }}
                />
                <Select
                  label={t("settings.logFileLabel")}
                  value={logsFile}
                  data={fileOptions}
                  placeholder={t("settings.logFilePlaceholder")}
                  onChange={(value) => {
                    setLogsFile(value || "");
                    setLogsPage(1);
                  }}
                  searchable
                  clearable
                />
                <Select
                  label={t("settings.logLinesPerPage")}
                  value={String(logsLines)}
                  data={LOG_LINES_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                  allowDeselect={false}
                  onChange={(value) => {
                    const parsed = Number(value || "200");
                    setLogsLines(Number.isFinite(parsed) ? parsed : 200);
                    setLogsPage(1);
                  }}
                />
              </Group>

              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {t("settings.logPath")}: {logs?.path || "-"} · {t("common.total")} {logs?.totalLines || 0}
                </Text>
                <Button
                  variant="default"
                  leftSection={<RefreshCcw size={14} />}
                  loading={logsLoading}
                  onClick={() => setLogsRefreshNonce((current) => current + 1)}
                >
                  {t("common.refresh")}
                </Button>
              </Group>

              <Pagination
                total={Math.max(logs?.totalPages || 1, 1)}
                value={logsPage}
                onChange={setLogsPage}
              />

              <ScrollArea className="settings-log-scroll">
                <pre className="settings-log-content">{logContent}</pre>
              </ScrollArea>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="plugins" pt="md">
            <Stack gap="md">
              <Title order={4}>{t("settings.sitePluginTitle")}</Title>

              <Accordion variant="separated" radius="md" defaultValue="douban">
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
                      <Group grow align="flex-end">
                        <NumberInput
                          label={t("settings.backfillLimit")}
                          min={10}
                          max={2000}
                          step={50}
                          value={backfillLimit}
                          onChange={(value) =>
                            setBackfillLimit(typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 200)
                          }
                        />
                        <Button loading={backfilling} onClick={() => void runLocalizedBackfill()}>
                          {t("settings.backfillButton")}
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
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => void loadSettings()}>
            {t("common.refresh")}
          </Button>
          <Button leftSection={<Save size={14} />} loading={saving} onClick={() => void saveSettings()}>
            {t("settings.save")}
          </Button>
        </Group>
      </Card>
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

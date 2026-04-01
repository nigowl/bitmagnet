"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useTabsUnderline } from "@/lib/use-tabs-underline";
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
  const [logsLines, setLogsLines] = useState(1000);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
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
      <ScrollArea className="settings-plugin-test-scroll" h={320} type="auto" scrollbarSize={8}>
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
        <Tabs ref={tabsRef} className="app-tabs" defaultValue="logs">
          <Tabs.List grow>
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
                    const parsed = Number(value || "1000");
                    setLogsLines(Number.isFinite(parsed) ? parsed : 1000);
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

              <ScrollArea className="settings-log-scroll" h={560} type="auto" scrollbarSize={8}>
                <pre className="settings-log-content">{logContent}</pre>
              </ScrollArea>
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

        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => {
              void loadSettings();
              void loadSubtitleTemplates();
            }}
          >
            {t("common.refresh")}
          </Button>
          <Button leftSection={<Save size={14} />} loading={saving} onClick={() => void saveSettings()}>
            {t("settings.save")}
          </Button>
        </Group>
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

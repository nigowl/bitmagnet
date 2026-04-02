"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { LogIn, RefreshCcw } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/languages/provider";

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

const LOG_LINES_OPTIONS = [
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "500", label: "500" },
  { value: "1000", label: "1000" }
] as const;

export function LogsPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();

  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshNonce, setLogsRefreshNonce] = useState(0);
  const [logsCategory, setLogsCategory] = useState("main");
  const [logsFile, setLogsFile] = useState("");
  const [logsPage, setLogsPage] = useState(1);
  const [logsLines, setLogsLines] = useState(1000);
  const [logs, setLogs] = useState<LogsResponse | null>(null);

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
        if (!cancelled) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        }
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

  const categoryOptions = useMemo(
    () =>
      (logs?.categories?.length ? logs.categories : [{ key: "main" }, { key: "dht" }, { key: "site_plugins" }]).map((item) => ({
        value: item.key,
        label: t(`logs.category.${item.key}`)
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
    return logs?.message || t("logs.empty");
  }, [logs?.lines, logs?.message, t]);

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

  return (
    <Stack gap="md">
      <Card className="glass-card" withBorder>
        <Stack gap={4}>
          <Title order={2}>{t("logs.title")}</Title>
          <Text c="dimmed">{t("logs.subtitle")}</Text>
        </Stack>
      </Card>

      <Card className="glass-card" withBorder>
        <Stack gap="md">
          <Group grow className="settings-log-controls">
            <Select
              label={t("logs.categoryLabel")}
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
              label={t("logs.fileLabel")}
              value={logsFile}
              data={fileOptions}
              placeholder={t("logs.filePlaceholder")}
              onChange={(value) => {
                setLogsFile(value || "");
                setLogsPage(1);
              }}
              searchable
              clearable
            />
            <Select
              label={t("logs.linesPerPage")}
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
              {t("logs.path")}: {logs?.path || "-"} · {t("common.total")} {logs?.totalLines || 0}
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
      </Card>
    </Stack>
  );
}

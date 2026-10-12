"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { LogIn, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import {
  deleteAdminTopic,
  fetchAdminTopics,
  rebuildAdminTopics,
  updateAdminTopic,
  type MediaTopicAdminItem
} from "@/lib/media-api";
import { emptyTopicEditor, TopicEditor, TopicEditorModal } from "@/components/topic-editor-modal";

const ADMIN_TOPIC_PAGE_SIZE = 10;

export function TopicsManagementPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [topics, setTopics] = useState<MediaTopicAdminItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [editor, setEditor] = useState<TopicEditor | null>(null);
  const editorOpened = editor !== null;

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const topicResult = await fetchAdminTopics({ limit: ADMIN_TOPIC_PAGE_SIZE, page });
      setTopics(topicResult.items);
      setTotalCount(topicResult.totalCount);
      const totalPages = Math.max(1, Math.ceil(topicResult.totalCount / ADMIN_TOPIC_PAGE_SIZE));
      if (page > totalPages) setPage(totalPages);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setEditor(emptyTopicEditor());
  const openEdit = (topic: MediaTopicAdminItem) => {
    setEditor({
      id: topic.id,
      name: topic.name,
      description: topic.description,
      sortOrder: topic.sortOrder,
      mediaIds: topic.mediaIds,
      enabled: topic.enabled
    });
  };

  const remove = (topic: MediaTopicAdminItem) => {
    modals.openConfirmModal({
      title: t("topics.manage.deleteTitle"),
      children: <Text size="sm">{t("topics.manage.deleteHint")}</Text>,
      labels: { confirm: t("common.delete"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          try {
            await deleteAdminTopic(topic.id);
            notifications.show({ color: "green", message: t("topics.manage.deleted") });
            await load();
          } catch (error) {
            notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
          }
        })();
      }
    });
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const result = await rebuildAdminTopics();
      notifications.show({
        color: "green",
        message: t("topics.manage.rebuilt")
          .replace("{topics}", String(result.topicCount))
          .replace("{items}", String(result.itemCount))
      });
      await load();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setRebuilding(false);
    }
  };

  if (authLoading) {
    return <Group justify="center" py="xl"><Loader /></Group>;
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
    return <Group justify="center" py="xl"><Loader /></Group>;
  }

  return (
    <>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={2}>{t("topics.manage.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("topics.manage.subtitle")}</Text>
          </div>
          <Group gap="sm">
            <Tooltip label={rebuilding ? t("topics.manage.rebuilding") : t("topics.manage.rebuild")} withArrow>
              <ActionIcon
                className="app-icon-btn spin-on-active"
                data-spinning={rebuilding ? "true" : "false"}
                variant="default"
                size="lg"
                loading={rebuilding}
                onClick={() => void rebuild()}
                aria-label={t("topics.manage.rebuild")}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("topics.manage.create")} withArrow>
              <ActionIcon className="app-icon-btn" variant="default" size="lg" onClick={openCreate} aria-label={t("topics.manage.create")}>
                <Plus size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" c="dimmed">{t("topics.manage.builtInHint")}</Text>

        {topics.length === 0 ? (
          <Card className="glass-card" withBorder><Text c="dimmed">{t("topics.manage.empty")}</Text></Card>
        ) : (
          <Card className="glass-card" withBorder>
            <ScrollArea type="auto" scrollbarSize={8}>
              <Table striped withTableBorder highlightOnHover miw={920}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("topics.manage.name")}</Table.Th>
                    <Table.Th>{t("topics.manage.type")}</Table.Th>
                    <Table.Th>{t("topics.manage.status")}</Table.Th>
                    <Table.Th>{t("topics.manage.media")}</Table.Th>
                    <Table.Th>{t("topics.manage.sortWeight")}</Table.Th>
                    <Table.Th>{t("topics.manage.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {topics.map((topic) => (
                    <Table.Tr key={topic.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={600}>{topicLabel(topic, t)}</Text>
                          <Text size="xs" c="dimmed" lineClamp={1} title={topic.description}>{topic.description || "-"}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4} align="flex-start">
                          <Badge variant="light" color={topic.kind === "custom" ? "blue" : "orange"}>
                            {topic.kind === "custom" ? t("topics.manage.kindCustom") : t("topics.manage.kindSystem")}
                          </Badge>
                          <Badge variant="outline">{topicModuleLabel(topic.module, t)}</Badge>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          aria-label={t("topics.manage.enabled")}
                          checked={topic.enabled}
                          onChange={() => {
                            void updateAdminTopic(topic.id, {
                              name: topic.name,
                              description: topic.description,
                              sortOrder: topic.sortOrder,
                              mediaIds: topic.mediaIds,
                              enabled: !topic.enabled
                            }).then(load).catch((error) => {
                              notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
                            });
                          }}
                        />
                      </Table.Td>
                      <Table.Td>{topic.itemCount}</Table.Td>
                      <Table.Td>#{topic.sortOrder}</Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Tooltip label={t("topics.manage.edit")} withArrow>
                            <ActionIcon className="app-icon-btn" variant="default" aria-label={t("topics.manage.edit")} onClick={() => openEdit(topic)}>
                              <Pencil size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("common.delete")} withArrow>
                            <ActionIcon className="app-icon-btn" color="red" variant="default" aria-label={t("common.delete")} onClick={() => remove(topic)}>
                              <Trash2 size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Group justify="space-between" mt="md" wrap="wrap">
              <Text c="dimmed" size="sm">{t("common.total")}: {totalCount}</Text>
              <Pagination
                total={Math.max(1, Math.ceil(totalCount / ADMIN_TOPIC_PAGE_SIZE))}
                value={page}
                onChange={setPage}
                siblings={1}
                boundaries={1}
              />
            </Group>
          </Card>
        )}
      </Stack>

      <TopicEditorModal
        opened={editorOpened}
        editor={editor}
        onChange={setEditor}
        onClose={() => setEditor(null)}
        onSaved={() => void load()}
      />
    </>
  );
}

function topicModuleLabel(module: string, t: (key: string) => string): string {
  const key = `topics.modules.${module}`;
  const label = t(key);
  return label === key ? module : label;
}

function topicLabel(topic: MediaTopicAdminItem, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    "curated:high-rated-movies": t("topics.builtIn.highRatedMovies"),
    "curated:popular-movies": t("topics.builtIn.popularMovies"),
    "curated:popular-series": t("topics.builtIn.popularSeries"),
    "curated:award-winning": t("topics.builtIn.awardWinning")
  };
  return labels[topic.id] || topic.name;
}

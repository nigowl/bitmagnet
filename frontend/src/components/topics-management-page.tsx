"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  ScrollArea,
  Stack,
  Switch,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { LogIn, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import {
  createAdminTopic,
  deleteAdminTopic,
  fetchAdminTopics,
  fetchMediaList,
  fetchMediaDetail,
  rebuildAdminTopics,
  updateAdminTopic,
  type MediaListItem,
  type MediaDetailResponse,
  type MediaTopicAdminInput,
  type MediaTopicAdminItem
} from "@/lib/media-api";
import { getDisplayTitle } from "@/lib/media";

type TopicEditor = MediaTopicAdminInput & { id?: string };

const ADMIN_TOPIC_PAGE_SIZE = 10;

function emptyEditor(): TopicEditor {
  return { name: "", description: "", sortOrder: 100, mediaIds: [], enabled: true };
}

function numberValue(value: string | number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

export function TopicsManagementPage() {
  const { t, locale } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();
  const [topics, setTopics] = useState<MediaTopicAdminItem[]>([]);
  const [media, setMedia] = useState<MediaListItem[]>([]);
  const [selectedMediaDetails, setSelectedMediaDetails] = useState<Record<string, MediaDetailResponse["item"]>>({});
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaCategory, setMediaCategory] = useState<"all" | "movie" | "series">("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<TopicEditor | null>(null);
  const editorOpened = editor !== null;

  const loadMedia = useCallback(async (search: string, category: "all" | "movie" | "series") => {
    setMediaLoading(true);
    try {
      const result = await fetchMediaList({ search, category, sort: "popular", limit: 120, page: 1 });
      setMedia(result.items);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!editorOpened) return;
    const timer = window.setTimeout(() => {
      void loadMedia(mediaSearch, mediaCategory);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [editorOpened, mediaCategory, mediaSearch, loadMedia]);

  useEffect(() => {
    if (!editorOpened || !editor) return;
    const mediaIDs = editor.mediaIds.filter((id) => !selectedMediaDetails[id]);
    if (mediaIDs.length === 0) return;

    let active = true;
    void Promise.allSettled(
      mediaIDs.map(async (id) => {
        const result = await fetchMediaDetail(id);
        return { id, item: result.item };
      })
    ).then((results) => {
      if (!active) return;
      setSelectedMediaDetails((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.item) {
            next[result.value.id] = result.value.item;
          }
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [editor, editorOpened, selectedMediaDetails]);

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

  const openCreate = () => setEditor(emptyEditor());
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

  const save = async () => {
    if (!editor || !editor.name.trim()) {
      notifications.show({ color: "yellow", message: t("topics.manage.name") });
      return;
    }
    setSaving(true);
    try {
      const input: MediaTopicAdminInput = {
        name: editor.name.trim(),
        description: editor.description.trim(),
        sortOrder: editor.sortOrder,
        mediaIds: editor.mediaIds,
        enabled: editor.enabled
      };
      if (editor.id) {
        await updateAdminTopic(editor.id, input);
        notifications.show({ color: "green", message: t("topics.manage.updated") });
      } else {
        await createAdminTopic(input);
        notifications.show({ color: "green", message: t("topics.manage.created") });
      }
      setEditor(null);
      await load();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
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

  const mediaOptions = media.map((item) => ({
    value: item.id,
    label: mediaOptionLabel(item, locale)
  }));
  const selectedMediaOptions = (editor?.mediaIds || [])
    .filter((id) => !media.some((item) => item.id === id))
    .map((id) => ({
      value: id,
      label: selectedMediaDetails[id] ? mediaOptionLabel(selectedMediaDetails[id], locale) : id
    }));

  return (
    <>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={2}>{t("topics.manage.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("topics.manage.subtitle")}</Text>
          </div>
          <Group gap="sm">
            <Button variant="default" leftSection={<RefreshCw size={15} />} loading={rebuilding} onClick={() => void rebuild()}>
              {rebuilding ? t("topics.manage.rebuilding") : t("topics.manage.rebuild")}
            </Button>
            <Button leftSection={<Plus size={15} />} onClick={openCreate}>{t("topics.manage.create")}</Button>
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
                    <Table.Th>{t("topics.manage.sortOrder")}</Table.Th>
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
                            <ActionIcon className="app-icon-btn" variant="light" aria-label={t("topics.manage.edit")} onClick={() => openEdit(topic)}>
                              <Pencil size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("common.delete")} withArrow>
                            <ActionIcon className="app-icon-btn" color="red" variant="light" aria-label={t("common.delete")} onClick={() => remove(topic)}>
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

      <Modal
        opened={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? t("topics.manage.edit") : t("topics.manage.create")}
        size="lg"
      >
        {editor ? (
          <Stack>
            <TextInput
              label={t("topics.manage.name")}
              value={editor.name}
              onChange={(event) => setEditor((current) => current ? { ...current, name: event.currentTarget.value } : current)}
              required
            />
            <Textarea
              label={t("topics.manage.description")}
              value={editor.description}
              onChange={(event) => setEditor((current) => current ? { ...current, description: event.currentTarget.value } : current)}
              minRows={3}
            />
            <NumberInput
              label={t("topics.manage.sortOrder")}
              value={editor.sortOrder}
              min={-100000}
              max={100000}
              onChange={(value) => setEditor((current) => current ? { ...current, sortOrder: numberValue(value) } : current)}
            />
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                label={t("topics.manage.mediaSearch")}
                placeholder={t("topics.manage.mediaPlaceholder")}
                value={mediaSearch}
                onChange={(event) => setMediaSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadMedia(mediaSearch, mediaCategory);
                  }
                }}
                style={{ flex: 1 }}
              />
              <Select
                label={t("topics.manage.mediaType")}
                data={[
                  { value: "all", label: t("topics.manage.mediaTypes.all") },
                  { value: "movie", label: t("topics.manage.mediaTypes.movie") },
                  { value: "series", label: t("topics.manage.mediaTypes.series") }
                ]}
                value={mediaCategory}
                onChange={(value) => setMediaCategory((value as "all" | "movie" | "series") || "all")}
                w={140}
              />
              <Tooltip label={t("nav.search")} withArrow>
                <ActionIcon
                  className="app-icon-btn"
                  variant="light"
                  size="lg"
                  aria-label={t("nav.search")}
                  loading={mediaLoading}
                  onClick={() => void loadMedia(mediaSearch, mediaCategory)}
                >
                  <Search size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <MultiSelect
              label={t("topics.manage.media")}
              placeholder={t("topics.manage.mediaPlaceholder")}
              data={[...mediaOptions, ...selectedMediaOptions]}
              value={editor.mediaIds}
              onChange={(mediaIds) => setEditor((current) => current ? { ...current, mediaIds } : current)}
              searchable
              clearable
              maxDropdownHeight={280}
              styles={{
                pillsList: {
                  maxHeight: 180,
                  overflowY: "auto",
                  alignContent: "flex-start"
                }
              }}
            />
            <Switch
              label={t("topics.manage.enabled")}
              checked={editor.enabled}
              onChange={(event) => setEditor((current) => current ? { ...current, enabled: event.currentTarget.checked } : current)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditor(null)}>{t("common.cancel")}</Button>
              <Button loading={saving} onClick={() => void save()}>{t("topics.manage.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}

function topicModuleLabel(module: string, t: (key: string) => string): string {
  const key = `topics.modules.${module}`;
  const label = t(key);
  return label === key ? module : label;
}

function mediaOptionLabel(item: MediaListItem | MediaDetailResponse["item"], locale: string): string {
  return getDisplayTitle(item, locale === "en" ? "en" : "zh") || item.title || item.id;
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

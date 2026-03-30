"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Copy, ExternalLink, Eye, FilterX, RefreshCw, Search, Tags, Trash2, WandSparkles } from "lucide-react";
import { graphqlRequest } from "@/lib/api";
import {
  TORRENT_CONTENT_SEARCH_QUERY,
  TORRENT_DELETE_MUTATION,
  TORRENT_DELETE_TAGS_MUTATION,
  TORRENT_FILES_QUERY,
  TORRENT_PUT_TAGS_MUTATION,
  TORRENT_REPROCESS_MUTATION,
  TORRENT_SET_TAGS_MUTATION
} from "@/lib/graphql";
import { contentTypes, torrentOrderFields } from "@/lib/domain";
import { useI18n } from "@/languages/provider";

type TorrentRow = {
  infoHash: string;
  contentType?: string | null;
  title: string;
  seeders?: number | null;
  leechers?: number | null;
  publishedAt?: string | null;
  torrent: {
    infoHash: string;
    name: string;
    size: number;
    singleFile?: boolean | null;
    fileType?: string | null;
    seeders?: number | null;
    leechers?: number | null;
    magnetUri?: string | null;
    tagNames: string[];
    sources: Array<{ key: string; name: string }>;
  };
  content?: {
    title?: string | null;
    overview?: string | null;
    releaseYear?: number | null;
  } | null;
};

type SearchResult = {
  totalCount: number;
  hasNextPage?: boolean | null;
  items: TorrentRow[];
  aggregations: {
    contentType: Array<{ value?: string | null; label: string; count: number }>;
    torrentSource: Array<{ value: string; label: string; count: number }>;
    torrentTag: Array<{ value: string; label: string; count: number }>;
  };
};

type SearchResponse = {
  torrentContent: {
    search: SearchResult;
  };
};

type TorrentFilesResponse = {
  torrent: {
    files: {
      items: Array<{
        index: number;
        path: string;
        size: number;
        fileType?: string | null;
      }>;
    };
  };
};

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function formatBytes(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function TorrentsPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [contentType, setContentType] = useState<string | null>(null);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<(typeof torrentOrderFields)[number]>("updated_at");
  const [descending, setDescending] = useState(true);
  const [result, setResult] = useState<SearchResult | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<TorrentRow | null>(null);
  const [detailTagInput, setDetailTagInput] = useState("");
  const [detailFiles, setDetailFiles] = useState<TorrentFilesResponse["torrent"]["files"]["items"]>([]);
  const [loadingDetailFiles, setLoadingDetailFiles] = useState(false);

  const { t } = useI18n();

  const renderContentType = useCallback(
    (type?: string | null) => {
      if (!type) return "-";
      const key = `contentTypes.${type}`;
      const translated = t(key);
      return translated === key ? type : translated;
    },
    [t]
  );

  const orderLabels: Record<(typeof torrentOrderFields)[number], string> = useMemo(
    () => ({
      relevance: t("torrents.order.relevance"),
      published_at: t("torrents.order.publishedAt"),
      updated_at: t("torrents.order.updatedAt"),
      size: t("torrents.order.size"),
      files_count: t("torrents.order.filesCount"),
      seeders: t("torrents.order.seeders"),
      leechers: t("torrents.order.leechers"),
      name: t("torrents.order.name"),
      info_hash: t("torrents.order.infoHash")
    }),
    [t]
  );

  const contentTypeOptions = useMemo(
    () => [
      { value: "", label: t("torrents.all") },
      ...contentTypes.map((key) => ({ value: key, label: t(`contentTypes.${key}`) }))
    ],
    [t]
  );

  const totalPages = useMemo(() => {
    if (!result?.totalCount) return 1;
    return Math.max(1, Math.ceil(result.totalCount / limit));
  }, [limit, result?.totalCount]);

  const detailDisplayFiles = useMemo(() => {
    if (!activeItem) return [];
    if (detailFiles.length > 0) return detailFiles;
    if (!activeItem.torrent.singleFile) return [];
    return [
      {
        index: 0,
        path: activeItem.torrent.name,
        size: activeItem.torrent.size,
        fileType: activeItem.torrent.fileType || null
      }
    ];
  }, [activeItem, detailFiles]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resolvedOrder = orderBy === "relevance" && !debouncedSearch ? "updated_at" : orderBy;
      const data = await graphqlRequest<SearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
        input: {
          queryString: debouncedSearch || undefined,
          limit,
          page,
          totalCount: true,
          hasNextPage: true,
          orderBy: [{ field: resolvedOrder, descending }],
          facets: {
            contentType: {
              aggregate: true,
              filter: contentType ? [contentType] : undefined
            },
            torrentSource: {
              aggregate: true,
              filter: sourceFilters.length ? sourceFilters : undefined
            },
            torrentTag: {
              aggregate: true,
              filter: tagFilters.length ? tagFilters : undefined
            }
          }
        }
      });
      setResult(data.torrentContent.search);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [contentType, debouncedSearch, descending, limit, orderBy, page, sourceFilters, tagFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearch(initialQuery);
    setPage(1);
  }, [initialQuery]);

  const clearFilters = () => {
    setSearch("");
    setContentType(null);
    setSourceFilters([]);
    setTagFilters([]);
    setOrderBy("updated_at");
    setDescending(true);
    setPage(1);
  };

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      notifications.show({ color: "green", message: t("torrents.copied") });
    } catch {
      notifications.show({ color: "yellow", message: t("torrents.copyFailed") });
    }
  };

  const openMagnet = (magnetUri?: string | null) => {
    if (!magnetUri) {
      notifications.show({ color: "yellow", message: t("torrents.magnetUnavailable") });
      return;
    }
    window.open(magnetUri, "_blank", "noopener,noreferrer");
  };

  const loadFilesFor = async (infoHash: string) => {
    setLoadingDetailFiles(true);
    try {
      const data = await graphqlRequest<TorrentFilesResponse>(TORRENT_FILES_QUERY, {
        input: {
          infoHashes: [infoHash],
          limit: 500,
          page: 1
        }
      });
      setDetailFiles(data.torrent.files.items || []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      setDetailFiles([]);
    } finally {
      setLoadingDetailFiles(false);
    }
  };

  const openDetail = (item: TorrentRow) => {
    setActiveItem(item);
    setDetailTagInput((item.torrent.tagNames || []).join(","));
    setDetailFiles([]);
    setDetailOpen(true);
    void loadFilesFor(item.infoHash);
  };

  const mutateTags = async (mode: "set" | "put" | "delete") => {
    if (!activeItem) return;
    const tags = parseTags(detailTagInput);
    if (!tags.length) {
      notifications.show({ color: "yellow", message: t("torrents.enterTags") });
      return;
    }
    const mutation =
      mode === "set"
        ? TORRENT_SET_TAGS_MUTATION
        : mode === "put"
          ? TORRENT_PUT_TAGS_MUTATION
          : TORRENT_DELETE_TAGS_MUTATION;

    try {
      await graphqlRequest(mutation, { infoHashes: [activeItem.infoHash], tagNames: tags });
      notifications.show({ color: "green", message: t("torrents.actionDone") });
      await load();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const reprocessActive = async () => {
    if (!activeItem) return;
    try {
      await graphqlRequest(TORRENT_REPROCESS_MUTATION, {
        input: {
          infoHashes: [activeItem.infoHash],
          classifierRematch: false,
          apisDisabled: true,
          localSearchDisabled: true
        }
      });
      notifications.show({ color: "green", message: t("torrents.actionDone") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const deleteActive = () => {
    if (!activeItem) return;
    modals.openConfirmModal({
      title: t("torrents.deleteTitle"),
      children: <Text size="sm">{t("torrents.deleteHint")}</Text>,
      labels: { confirm: t("torrents.delete"), cancel: t("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await graphqlRequest(TORRENT_DELETE_MUTATION, { infoHashes: [activeItem.infoHash] });
          notifications.show({ color: "green", message: t("torrents.actionDone") });
          setDetailOpen(false);
          setActiveItem(null);
          await load();
        } catch (error) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("torrents.title")}</Title>
          <Text c="dimmed">{t("torrents.subtitle")}</Text>
        </div>
        <Group>
          <Button leftSection={<FilterX size={16} />} variant="light" onClick={clearFilters}>
            {t("torrents.clearFilters")}
          </Button>
          <Button leftSection={<RefreshCw size={16} />} variant="default" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" wrap="wrap">
        <Card className="glass-card" withBorder w={{ base: "100%", lg: 320 }}>
          <Stack>
            <TextInput
              label={t("torrents.search")}
              leftSection={<Search size={16} />}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
            />
            <Select
              label={t("torrents.contentType")}
              data={contentTypeOptions}
              value={contentType || ""}
              onChange={(value) => {
                setContentType(value || null);
                setPage(1);
              }}
            />
            <Select
              label={t("torrents.orderBy")}
              data={torrentOrderFields.map((item) => ({ value: item, label: orderLabels[item] }))}
              value={orderBy}
              onChange={(value) => {
                if (!value) return;
                setOrderBy(value as (typeof torrentOrderFields)[number]);
                setPage(1);
              }}
            />
            <Select
              label={t("torrents.direction")}
              data={[
                { value: "desc", label: t("common.desc") },
                { value: "asc", label: t("common.asc") }
              ]}
              value={descending ? "desc" : "asc"}
              onChange={(value) => {
                setDescending(value !== "asc");
                setPage(1);
              }}
            />
            <NumberInput
              label={t("torrents.pageSize")}
              min={5}
              max={100}
              value={limit}
              onChange={(value) => {
                setLimit(Number(value) || 20);
                setPage(1);
              }}
            />
            <MultiSelect
              label={t("torrents.sourceFilter")}
              data={(result?.aggregations.torrentSource || []).map((item) => ({ value: item.value, label: `${item.label} (${item.count})` }))}
              value={sourceFilters}
              onChange={(value) => {
                setSourceFilters(value);
                setPage(1);
              }}
              searchable
            />
            <MultiSelect
              label={t("torrents.tagFilter")}
              data={(result?.aggregations.torrentTag || []).map((item) => ({ value: item.value, label: `${item.label} (${item.count})` }))}
              value={tagFilters}
              onChange={(value) => {
                setTagFilters(value);
                setPage(1);
              }}
              searchable
            />
          </Stack>
        </Card>

        <Stack style={{ flex: 1, minWidth: 0 }}>
          <Card className="glass-card" withBorder>
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("torrents.table.title")}</Table.Th>
                    <Table.Th>{t("torrents.table.type")}</Table.Th>
                    <Table.Th>{t("torrents.table.size")}</Table.Th>
                    <Table.Th>{t("torrents.table.seeders")}</Table.Th>
                    <Table.Th>{t("torrents.table.leechers")}</Table.Th>
                    <Table.Th>{t("torrents.table.source")}</Table.Th>
                    <Table.Th>{t("torrents.table.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Group justify="center" py="md">
                          <Loader size="sm" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : (result?.items.length || 0) === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text c="dimmed" ta="center" py="md">
                          {t("torrents.noResults")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    (result?.items || []).map((item) => (
                      <Table.Tr key={item.infoHash}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Link href={`/torrents/${item.infoHash}`} style={{ textDecoration: "none", color: "inherit" }}>
                              <Text fw={600} lineClamp={1} title={item.title || item.torrent.name} style={{ maxWidth: "min(56vw, 620px)" }}>
                                {item.title || item.torrent.name}
                              </Text>
                            </Link>
                            <Text size="xs" c="dimmed" ff="monospace">{item.infoHash}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{renderContentType(item.contentType)}</Table.Td>
                        <Table.Td>{formatBytes(item.torrent.size)}</Table.Td>
                        <Table.Td>{item.seeders ?? item.torrent.seeders ?? "-"}</Table.Td>
                        <Table.Td>{item.leechers ?? item.torrent.leechers ?? "-"}</Table.Td>
                        <Table.Td>{item.torrent.sources[0]?.name || "-"}</Table.Td>
                        <Table.Td>
                          <Tooltip label={t("torrents.details")}>
                            <ActionIcon variant="light" onClick={() => openDetail(item)}>
                              <Eye size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Card>

          <Group justify="space-between">
            <Text size="sm" c="dimmed">{t("common.total")}: {result?.totalCount || 0}</Text>
            <Pagination total={totalPages} value={page} onChange={setPage} />
          </Group>
        </Stack>
      </Group>

      <Modal opened={detailOpen} onClose={() => setDetailOpen(false)} title={activeItem?.title || activeItem?.torrent.name} size="xl">
        {!activeItem ? null : (
          <Stack>
            <Text c="dimmed">{activeItem.content?.overview || "-"}</Text>
            <Group gap={6}>
              <Badge variant="light">{renderContentType(activeItem.contentType)}</Badge>
              <Badge variant="light">{t("torrents.table.seeders")}: {activeItem.seeders ?? "-"}</Badge>
              <Badge variant="light">{t("torrents.table.leechers")}: {activeItem.leechers ?? "-"}</Badge>
              <Badge variant="light">{formatBytes(activeItem.torrent.size)}</Badge>
            </Group>
            <Text ff="monospace" size="sm">{activeItem.infoHash}</Text>
            <Group>
              <Button size="xs" leftSection={<Copy size={14} />} variant="light" onClick={() => void copyHash(activeItem.infoHash)}>
                {t("torrents.copyHash")}
              </Button>
              <Button size="xs" leftSection={<ExternalLink size={14} />} variant="light" onClick={() => openMagnet(activeItem.torrent.magnetUri)}>
                {t("torrents.openMagnet")}
              </Button>
              <Button size="xs" leftSection={<WandSparkles size={14} />} variant="light" onClick={() => void reprocessActive()}>
                {t("torrents.reprocess")}
              </Button>
              <Button size="xs" leftSection={<Trash2 size={14} />} color="red" variant="light" onClick={deleteActive}>
                {t("torrents.delete")}
              </Button>
            </Group>

            <TextInput
              label={t("torrents.tagsInput")}
              value={detailTagInput}
              onChange={(event) => setDetailTagInput(event.currentTarget.value)}
              rightSection={<Tags size={16} />}
            />
            <Group>
              <Button size="xs" onClick={() => void mutateTags("set")}>{t("torrents.setTags")}</Button>
              <Button size="xs" variant="light" onClick={() => void mutateTags("put")}>{t("torrents.putTags")}</Button>
              <Button size="xs" variant="light" color="orange" onClick={() => void mutateTags("delete")}>{t("torrents.deleteTags")}</Button>
            </Group>

            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>{t("torrents.table.path")}</Table.Th>
                  <Table.Th>{t("torrents.table.type")}</Table.Th>
                  <Table.Th>{t("torrents.table.size")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loadingDetailFiles ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Group justify="center" py="md">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : detailDisplayFiles.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">
                        {t("torrents.noFiles")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  detailDisplayFiles.map((file) => (
                    <Table.Tr key={`${file.index}:${file.path}`}>
                      <Table.Td>{file.index}</Table.Td>
                      <Table.Td>{file.path}</Table.Td>
                      <Table.Td>{file.fileType || "-"}</Table.Td>
                      <Table.Td>{formatBytes(file.size)}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

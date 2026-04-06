"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
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
    filesCount?: number | null;
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

function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanParam(raw: string | null, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function parsePositiveIntParam(raw: string | null, fallback: number): number {
  const parsed = Number(raw || "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function TorrentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const queryString = searchParams.get("q") || "";
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(queryString);
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [result, setResult] = useState<SearchResult | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<TorrentRow | null>(null);
  const [detailTagInput, setDetailTagInput] = useState("");
  const [detailFiles, setDetailFiles] = useState<TorrentFilesResponse["torrent"]["files"]["items"]>([]);
  const [loadingDetailFiles, setLoadingDetailFiles] = useState(false);

  const { t } = useI18n();

  const queryState = useMemo(() => {
    const parsedParams = new URLSearchParams(searchParamsString);
    const nextPage = Math.max(1, parsePositiveIntParam(parsedParams.get("page"), 1));
    const limitRaw = parsePositiveIntParam(parsedParams.get("limit"), 20);
    const allowedLimits = new Set([10, 20, 40, 60, 100]);
    const nextLimit = allowedLimits.has(limitRaw) ? limitRaw : 20;
    const nextTypes = parseListParam(parsedParams.get("types")).filter((item): item is (typeof contentTypes)[number] =>
      (contentTypes as readonly string[]).includes(item)
    );
    const nextSources = parseListParam(parsedParams.get("sources"));
    const nextTags = parseListParam(parsedParams.get("tags"));
    const nextOrder = ((torrentOrderFields as readonly string[]).includes(parsedParams.get("order") || "")
      ? parsedParams.get("order")
      : "updated_at") as (typeof torrentOrderFields)[number];
    const nextDescending = parseBooleanParam(parsedParams.get("desc"), true);

    return {
      page: nextPage,
      limit: nextLimit,
      contentTypeFilters: nextTypes,
      sourceFilters: nextSources,
      tagFilters: nextTags,
      orderBy: nextOrder,
      descending: nextDescending
    };
  }, [searchParamsString]);

  const {
    page,
    limit,
    contentTypeFilters,
    sourceFilters,
    tagFilters,
    orderBy,
    descending
  } = queryState;

  const updateQuery = useCallback(
    (updates: {
      q?: string | null;
      page?: number | null;
      limit?: number | null;
      types?: string[] | null;
      sources?: string[] | null;
      tags?: string[] | null;
      order?: (typeof torrentOrderFields)[number];
      desc?: boolean;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      const setMaybeString = (key: string, value: string | null | undefined) => {
        if (!value || !value.trim()) {
          params.delete(key);
          return;
        }
        params.set(key, value.trim());
      };

      const setMaybeArray = (key: string, value: string[] | null | undefined) => {
        if (!value || value.length === 0) {
          params.delete(key);
          return;
        }
        params.set(key, value.join(","));
      };

      const nextQ = updates.q !== undefined ? updates.q : queryString;
      const nextPage = updates.page !== undefined ? updates.page : page;
      const nextLimit = updates.limit !== undefined ? updates.limit : limit;
      const nextTypes = updates.types !== undefined ? updates.types : contentTypeFilters;
      const nextSources = updates.sources !== undefined ? updates.sources : sourceFilters;
      const nextTags = updates.tags !== undefined ? updates.tags : tagFilters;
      const nextOrder = updates.order !== undefined ? updates.order : orderBy;
      const nextDesc = updates.desc !== undefined ? updates.desc : descending;

      setMaybeString("q", nextQ);
      if (!nextPage || nextPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(nextPage));
      }
      if (!nextLimit || nextLimit === 20) {
        params.delete("limit");
      } else {
        params.set("limit", String(nextLimit));
      }
      setMaybeArray("types", nextTypes);
      setMaybeArray("sources", nextSources);
      setMaybeArray("tags", nextTags);
      params.set("order", nextOrder);
      params.set("desc", nextDesc ? "1" : "0");

      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [contentTypeFilters, descending, limit, orderBy, page, pathname, queryString, router, searchParams, sourceFilters, tagFilters]
  );

  useEffect(() => {
    setSearch(queryString);
  }, [queryString]);

  useEffect(() => {
    if (debouncedSearch.trim() === queryString.trim()) {
      return;
    }
    updateQuery({ q: debouncedSearch.trim() || null, page: null });
  }, [debouncedSearch, queryString, updateQuery]);

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

  const contentTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (result?.aggregations.contentType || []).forEach((item) => {
      if (!item.value) return;
      counts.set(item.value, item.count);
    });
    return counts;
  }, [result?.aggregations.contentType]);

  const contentTypeBlockOptions = useMemo(
    () =>
      contentTypes.map((key) => ({
        value: key,
        label: t(`contentTypes.${key}`),
        count: contentTypeCounts.get(key) ?? 0
      })),
    [contentTypeCounts, t]
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
              filter: contentTypeFilters.length ? contentTypeFilters : undefined
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
  }, [contentTypeFilters, debouncedSearch, descending, limit, orderBy, page, sourceFilters, tagFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setSearch("");
    updateQuery({
      q: null,
      page: null,
      limit: 20,
      types: null,
      sources: null,
      tags: null,
      order: "updated_at",
      desc: true
    });
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
          <Title order={2} className="page-title">{t("torrents.title")}</Title>
          <Text c="dimmed" className="page-subtitle">{t("torrents.subtitle")}</Text>
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

      <Group align="flex-start" wrap="wrap" className="torrents-layout">
        <Card className="glass-card torrent-filter-sidebar" withBorder w={{ base: "100%", lg: 320 }}>
          <Accordion className="torrents-filters" multiple defaultValue={["searchSort", "contentType", "source", "tag"]}>
            <Accordion.Item value="searchSort">
              <Accordion.Control>{t("torrents.search")}</Accordion.Control>
              <Accordion.Panel>
                <Stack>
                  <TextInput
                    mt={8}
                    leftSection={<Search size={16} />}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.currentTarget.value);
                    }}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="contentType">
              <Accordion.Control>{t("torrents.contentType")}</Accordion.Control>
              <Accordion.Panel>
                <Checkbox.Group
                  mt={8}
                  value={contentTypeFilters}
                  onChange={(value) => {
                    updateQuery({ types: value, page: null });
                  }}
                >
                  <Stack gap={8}>
                    {contentTypeBlockOptions.map((item) => (
                      <Checkbox
                        key={item.value}
                        value={item.value}
                        label={
                          <span className="filter-option-label">
                            <Text size="sm">{item.label}</Text>
                            <Badge size="xs" variant="light" className="filter-option-count">{item.count}</Badge>
                          </span>
                        }
                      />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="tag">
              <Accordion.Control>{t("torrents.tagFilter")}</Accordion.Control>
              <Accordion.Panel>
                {(result?.aggregations.torrentTag.length || 0) === 0 ? (
                  <Text size="sm" c="dimmed">{t("torrents.noFilterOptions")}</Text>
                ) : (
                  <ScrollArea.Autosize mah={280} offsetScrollbars>
                    <Checkbox.Group
                      mt={8}
                      value={tagFilters}
                      onChange={(value) => {
                        updateQuery({ tags: value, page: null });
                      }}
                    >
                      <Stack gap={8}>
                        {(result?.aggregations.torrentTag || []).map((item) => (
                          <Checkbox
                            key={item.value}
                            value={item.value}
                            label={
                              <span className="filter-option-label">
                                <Text size="sm" lineClamp={1}>{item.label}</Text>
                                <Badge size="xs" variant="light" className="filter-option-count">{item.count}</Badge>
                              </span>
                            }
                          />
                        ))}
                      </Stack>
                    </Checkbox.Group>
                  </ScrollArea.Autosize>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Card>

        <Stack className="torrent-results-column torrent-results-flex">
          <Card className="glass-card torrent-results-card" withBorder>
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap">
                <Group gap={8} className="sort-button-group">
                  {torrentOrderFields.map((field) => (
                    <Button
                      key={field}
                      size="xs"
                      variant={orderBy === field ? "light" : "subtle"}
                      color={orderBy === field ? "cyan" : "slate"}
                      onClick={() => {
                        updateQuery({ order: field, page: null });
                      }}
                    >
                      {orderLabels[field]}
                    </Button>
                  ))}
                </Group>
                <Group gap={8} className="sort-button-group">
                  <Button
                    size="xs"
                    variant={descending ? "light" : "subtle"}
                    color={descending ? "cyan" : "slate"}
                    onClick={() => {
                      updateQuery({ desc: true, page: null });
                    }}
                  >
                    {t("common.desc")}
                  </Button>
                  <Button
                    size="xs"
                    variant={!descending ? "light" : "subtle"}
                    color={!descending ? "cyan" : "slate"}
                    onClick={() => {
                      updateQuery({ desc: false, page: null });
                    }}
                  >
                    {t("common.asc")}
                  </Button>
                </Group>
              </Group>

              {loading ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              ) : (result?.items.length || 0) === 0 ? (
                <Text c="dimmed" ta="center" py="md">
                  {t("torrents.noResults")}
                </Text>
              ) : (
                (result?.items || []).map((item) => (
                  <Card key={item.infoHash} className="torrent-list-item" withBorder>
                    <Stack gap={8} className="torrent-resource-card">
                      <Group wrap="nowrap" justify="space-between" align="flex-start">
                        <Group wrap="nowrap" className="torrent-title-group">
                          <Link href={`/torrents/${item.infoHash}`} className="unstyled-link torrent-list-link">
                            <Text fw={800} lineClamp={1} title={item.title || item.torrent.name} className="torrent-resource-title">
                              {item.title || item.torrent.name}
                            </Text>
                          </Link>
                          <Badge variant="light" color="violet">
                            {renderContentType(item.contentType)}
                          </Badge>
                        </Group>
                      </Group>

                      <Group gap={6} wrap="wrap" className="torrent-resource-meta">
                        <Text size="xs" c="dimmed" ff="monospace" className="detail-code-line">
                          {item.infoHash}
                        </Text>
                        <Badge size="xs" variant="dot" color="cyan">
                          {item.torrent.sources[0]?.name || "-"}
                        </Badge>
                      </Group>

                      <Group justify="space-between" wrap="wrap" gap={8}>
                        <Group gap={8} wrap="wrap" className="card-meta-row">
                          <Badge variant="light">{formatBytes(item.torrent.size)}</Badge>
                          <Badge variant="light">
                            {t("torrents.table.filesCount")}: {item.torrent.filesCount ?? (item.torrent.singleFile ? 1 : "-")}
                          </Badge>
                          <Badge variant="light" color="teal">
                            {t("torrents.table.seeders")}: {item.seeders ?? item.torrent.seeders ?? "-"}
                          </Badge>
                          <Badge variant="light" color="orange">
                            {t("torrents.table.leechers")}: {item.leechers ?? item.torrent.leechers ?? "-"}
                          </Badge>
                        </Group>
                        <Group gap={6}>
                          <Tooltip label={t("torrents.copyHash")}>
                            <ActionIcon className="app-icon-btn" variant="light" onClick={() => void copyHash(item.infoHash)}>
                              <Copy size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("torrents.openMagnet")}>
                            <ActionIcon
                              className="app-icon-btn"
                              variant="light"
                              onClick={() => openMagnet(item.torrent.magnetUri)}
                              disabled={!item.torrent.magnetUri}
                            >
                              <ExternalLink size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("torrents.details")}>
                            <ActionIcon className="app-icon-btn" variant="light" onClick={() => openDetail(item)}>
                              <Eye size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                    </Stack>
                  </Card>
                ))
              )}
            </Stack>
          </Card>

          <Group justify="space-between">
            <Group gap="sm" wrap="wrap">
              <Text size="sm" c="dimmed">{t("common.total")}: {result?.totalCount || 0}</Text>
              <Select
                size="xs"
                w={140}
                data={[
                  { value: "10", label: `10 / ${t("common.page")}` },
                  { value: "20", label: `20 / ${t("common.page")}` },
                  { value: "40", label: `40 / ${t("common.page")}` },
                  { value: "60", label: `60 / ${t("common.page")}` },
                  { value: "100", label: `100 / ${t("common.page")}` }
                ]}
                value={String(limit)}
                onChange={(value) => {
                  const nextLimit = Number(value) || 20;
                  updateQuery({ limit: nextLimit, page: null });
                }}
              />
            </Group>
            <Pagination total={totalPages} value={page} onChange={(value) => updateQuery({ page: value })} />
          </Group>
        </Stack>
      </Group>

      <Modal opened={detailOpen} onClose={() => setDetailOpen(false)} title={activeItem?.title || activeItem?.torrent.name} size="xl">
        {!activeItem ? null : (
          <Stack gap="md">
            <Text c="dimmed">{activeItem.content?.overview || "-"}</Text>
            <Group gap={6}>
              <Badge variant="light">{renderContentType(activeItem.contentType)}</Badge>
              <Badge variant="light">{t("torrents.table.seeders")}: {activeItem.seeders ?? "-"}</Badge>
              <Badge variant="light">{t("torrents.table.leechers")}: {activeItem.leechers ?? "-"}</Badge>
              <Badge variant="light">{formatBytes(activeItem.torrent.size)}</Badge>
            </Group>
            <Text ff="monospace" size="sm">{activeItem.infoHash}</Text>

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

            <Group justify="space-between" className="modal-footer">
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
              <Button size="xs" variant="default" onClick={() => setDetailOpen(false)}>
                {t("common.cancel")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

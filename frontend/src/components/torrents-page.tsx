"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Pagination,
  Select,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { FilterX, RefreshCw } from "lucide-react";
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
import {
  type SearchResponse,
  type SearchResult,
  type TorrentFilesResponse,
  type TorrentRow,
  normalizeTorrentContentType,
  parseBooleanParam,
  parseListParam,
  parsePositiveIntParam,
  parseTags
} from "./torrents-page.helpers";
import { TorrentDetailModal } from "./torrents-page.detail-modal";
import { TorrentFiltersSidebar } from "./torrents-page.filters";
import { TorrentResultsCard } from "./torrents-page.results";

export function TorrentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const queryString = searchParams.get("q") || "";
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(queryString);
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

  const currentListHref = useMemo(
    () => (searchParamsString ? `${pathname}?${searchParamsString}` : pathname),
    [pathname, searchParamsString]
  );

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

  const commitSearch = useCallback(() => {
    const nextSearch = search.trim();
    if (nextSearch === queryString.trim()) return;
    updateQuery({ q: nextSearch || null, page: null });
  }, [queryString, search, updateQuery]);

  const renderContentType = useCallback(
    (type?: string | null) => {
      const normalized = normalizeTorrentContentType(type);
      if (!normalized) return "";
      const key = `contentTypes.${normalized}`;
      const translated = t(key);
      return translated === key ? normalized : translated;
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
      const normalizedValue = normalizeTorrentContentType(item.value);
      if (!normalizedValue) return;
      counts.set(normalizedValue, item.count);
    });
    return counts;
  }, [result?.aggregations.contentType]);

  const contentTypeBlockOptions = useMemo(
    () => {
      const selected = new Set(contentTypeFilters);
      return contentTypes
        .map((key) => ({
          value: key,
          label: t(`contentTypes.${key}`),
          count: contentTypeCounts.get(key) ?? 0
        }))
        .filter((item) => item.count > 0 || selected.has(item.value));
    },
    [contentTypeCounts, contentTypeFilters, t]
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
      const resolvedOrder = orderBy === "relevance" && !queryString.trim() ? "updated_at" : orderBy;
      const data = await graphqlRequest<SearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
        input: {
          queryString: queryString.trim() || undefined,
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
  }, [contentTypeFilters, descending, limit, orderBy, page, queryString, sourceFilters, tagFilters]);

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
        <TorrentFiltersSidebar
          t={t}
          search={search}
          contentTypeFilters={contentTypeFilters}
          tagFilters={tagFilters}
          contentTypeOptions={contentTypeBlockOptions}
          tagOptions={result?.aggregations.torrentTag || []}
          onSearchChange={setSearch}
          onCommitSearch={commitSearch}
          onChangeContentTypes={(value) => updateQuery({ types: value, page: null })}
          onChangeTags={(value) => updateQuery({ tags: value, page: null })}
        />

        <Stack className="torrent-results-column torrent-results-flex">
          <TorrentResultsCard
            t={t}
            loading={loading}
            items={result?.items || []}
            orderBy={orderBy}
            descending={descending}
            orderLabels={orderLabels}
            queryString={queryString}
            currentListHref={currentListHref}
            renderContentType={renderContentType}
            onChangeOrder={(field) => updateQuery({ order: field, page: null })}
            onChangeDescending={(nextDescending) => updateQuery({ desc: nextDescending, page: null })}
            onCopyHash={(hash) => void copyHash(hash)}
            onOpenMagnet={openMagnet}
            onOpenDetail={openDetail}
          />

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
                  const nextLimit = parsePositiveIntParam(value, 20);
                  updateQuery({ limit: nextLimit, page: null });
                }}
              />
            </Group>
            <Pagination total={totalPages} value={page} onChange={(value) => updateQuery({ page: value })} />
          </Group>
        </Stack>
      </Group>

      <TorrentDetailModal
        t={t}
        opened={detailOpen}
        activeItem={activeItem}
        detailTagInput={detailTagInput}
        detailFiles={detailDisplayFiles}
        loadingFiles={loadingDetailFiles}
        renderContentType={renderContentType}
        onClose={() => setDetailOpen(false)}
        onChangeTags={setDetailTagInput}
        onMutateTags={(mode) => void mutateTags(mode)}
        onCopyHash={(hash) => void copyHash(hash)}
        onOpenMagnet={openMagnet}
        onReprocess={() => void reprocessActive()}
        onDelete={deleteActive}
      />
    </Stack>
  );
}

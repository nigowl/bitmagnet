"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Image,
  Loader,
  Pagination,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { FilterX, RefreshCw, Search } from "lucide-react";
import { useI18n } from "@/languages/provider";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";

type MediaContentType = "all" | "movie" | "tv_show";
type MediaSort = "popular" | "latest" | "updated" | "name";

type MediaItem = {
  infoHash: string;
  title: string;
  seeders?: number | null;
  publishedAt?: string | null;
  videoResolution?: string | null;
  torrent: {
    name: string;
    size: number;
  };
  content?: {
    title?: string | null;
    releaseYear?: number | null;
    overview?: string | null;
    collections?: Array<{ type: string; name: string }> | null;
    attributes?: Array<{ source: string; key: string; value: string }> | null;
  } | null;
};

type MediaSearchResult = {
  totalCount: number;
  totalCountIsEstimate: boolean;
  hasNextPage?: boolean | null;
  items: MediaItem[];
  aggregations: {
    contentSource?: Array<{ value: string; label: string; count: number; isEstimate: boolean }> | null;
    genre?: Array<{ value: string; label: string; count: number; isEstimate: boolean }> | null;
    language?: Array<{ value: string; label: string; count: number; isEstimate: boolean }> | null;
    releaseYear?: Array<{ value: number | null; label: string; count: number; isEstimate: boolean }> | null;
    videoResolution?: Array<{ value: string | null; label: string; count: number; isEstimate: boolean }> | null;
  };
};

type MediaSearchResponse = {
  torrentContent: {
    search: MediaSearchResult;
  };
};

const sortMap: Record<MediaSort, { field: string; descending: boolean }> = {
  popular: { field: "seeders", descending: true },
  latest: { field: "published_at", descending: true },
  updated: { field: "updated_at", descending: true },
  name: { field: "name", descending: false }
};

function formatBytes(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function displayResolution(value?: string | null): string {
  if (!value) return "-";
  return value.startsWith("V") ? value.slice(1) : value;
}

function normalizeKey(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function MediaPage() {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [contentType, setContentType] = useState<MediaContentType>("all");
  const [source, setSource] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<MediaSort>("popular");

  const [result, setResult] = useState<MediaSearchResult | null>(null);

  const languageDisplayNames = useMemo(() => {
    try {
      const resolvedLocale = locale === "zh" ? "zh-Hans" : "en";
      return new Intl.DisplayNames([resolvedLocale], { type: "language" });
    } catch {
      return null;
    }
  }, [locale]);

  const translateFacetLabel = useCallback(
    (group: "sources" | "genres" | "languages", value?: string | null, fallback?: string | null) => {
      const base = value || fallback || "";
      const normalized = normalizeKey(base);
      if (normalized) {
        const key = `media.${group}.${normalized}`;
        const translated = t(key);
        if (translated !== key) return translated;
      }
      return fallback || value || "-";
    },
    [t]
  );

  const translateLanguageLabel = useCallback(
    (value?: string | null, fallback?: string | null) => {
      const raw = (value || "").replace(/_/g, "-").toLowerCase();
      if (raw && languageDisplayNames) {
        try {
          const direct = languageDisplayNames.of(raw);
          if (direct) return direct;
          const base = raw.split("-")[0];
          const baseName = languageDisplayNames.of(base);
          if (baseName) return baseName;
        } catch {
          // Fallback to dictionary-based translation below.
        }
      }
      return translateFacetLabel("languages", value, fallback);
    },
    [languageDisplayNames, translateFacetLabel]
  );

  const totalPages = useMemo(() => {
    if (!result?.totalCount) return 1;
    return Math.max(1, Math.ceil(result.totalCount / limit));
  }, [limit, result?.totalCount]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sortOption = sortMap[sortBy];
      const data = await graphqlRequest<MediaSearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
        input: {
          queryString: debouncedSearch || undefined,
          limit,
          page,
          totalCount: true,
          hasNextPage: true,
          orderBy: [
            {
              field: sortOption.field,
              descending: sortOption.descending
            }
          ],
          facets: {
            contentType: {
              aggregate: true,
              filter: contentType === "all" ? undefined : [contentType]
            },
            contentSource: {
              aggregate: true,
              filter: source ? [source] : undefined
            },
            genre: {
              aggregate: true,
              filter: genre ? [genre] : undefined
            },
            language: {
              aggregate: true,
              filter: language ? [language] : undefined
            },
            releaseYear: {
              aggregate: true,
              filter: year ? [Number(year)] : undefined
            },
            videoResolution: {
              aggregate: true,
              filter: resolution ? [resolution] : undefined
            }
          }
        }
      });

      setResult(data.torrentContent.search);
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoading(false);
    }
  }, [contentType, debouncedSearch, genre, language, limit, page, resolution, sortBy, source, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setSearch("");
    setContentType("all");
    setSource(null);
    setGenre(null);
    setLanguage(null);
    setResolution(null);
    setYear(null);
    setSortBy("popular");
    setPage(1);
  };

  const sourceOptions = useMemo(() => {
    const values = result?.aggregations.contentSource || [];
    const preferred = ["tmdb", "imdb", "tvdb"];
    const seen = new Set<string>();
    const ordered: Array<{ value: string; label: string }> = [];

    for (const key of preferred) {
      const matched = values.find((item) => item.value === key);
      if (!matched) continue;
      seen.add(key);
      ordered.push({
        value: key,
        label: `${translateFacetLabel("sources", matched.value, matched.label)} (${matched.count})`
      });
    }

    for (const item of values) {
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      ordered.push({
        value: item.value,
        label: `${translateFacetLabel("sources", item.value, item.label)} (${item.count})`
      });
    }

    return ordered;
  }, [result?.aggregations.contentSource, translateFacetLabel]);

  const genreOptions = useMemo(
    () =>
      (result?.aggregations.genre || []).map((item) => ({
        value: item.value,
        label: `${translateFacetLabel("genres", item.value, item.label)} (${item.count})`
      })),
    [result?.aggregations.genre, translateFacetLabel]
  );

  const languageOptions = useMemo(
    () =>
      (result?.aggregations.language || []).map((item) => ({
        value: item.value,
        label: `${translateLanguageLabel(item.value, item.label)} (${item.count})`
      })),
    [result?.aggregations.language, translateLanguageLabel]
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("media.title")}</Title>
          <Text c="dimmed">{t("media.subtitle")}</Text>
        </div>
        <Group>
          <Button leftSection={<FilterX size={16} />} variant="light" onClick={clearFilters}>
            {t("media.clearFilters")}
          </Button>
          <Select
            w={120}
            data={[
              { value: "20", label: `20 / ${t("common.page")}` },
              { value: "40", label: `40 / ${t("common.page")}` },
              { value: "60", label: `60 / ${t("common.page")}` }
            ]}
            value={String(limit)}
            onChange={(value) => {
              setLimit(Number(value) || 20);
              setPage(1);
            }}
          />
          <Button leftSection={<RefreshCw size={16} />} variant="default" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </Group>
      </Group>

      <Card className="glass-card" withBorder>
        <Stack gap="md">
          <TextInput
            label={t("media.search")}
            leftSection={<Search size={16} />}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
          />
          <Group justify="space-between" wrap="wrap">
            <SegmentedControl
              value={contentType}
              onChange={(value) => {
                setContentType(value as MediaContentType);
                setPage(1);
              }}
              data={[
                { value: "all", label: t("media.contentTypes.all") },
                { value: "movie", label: t("media.contentTypes.movie") },
                { value: "tv_show", label: t("media.contentTypes.tvShow") }
              ]}
            />
            <SegmentedControl
              value={sortBy}
              onChange={(value) => {
                setSortBy(value as MediaSort);
                setPage(1);
              }}
              data={[
                { value: "popular", label: t("media.sort.popular") },
                { value: "latest", label: t("media.sort.latest") },
                { value: "updated", label: t("media.sort.updated") },
                { value: "name", label: t("media.sort.name") }
              ]}
            />
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2, lg: 5 }}>
            <Select
              label={t("media.filters.source")}
              data={[{ value: "", label: t("media.all") }, ...sourceOptions]}
              value={source || ""}
              onChange={(value) => {
                setSource(value || null);
                setPage(1);
              }}
              searchable
            />
            <Select
              label={t("media.filters.genre")}
              data={[
                { value: "", label: t("media.all") },
                ...genreOptions
              ]}
              value={genre || ""}
              onChange={(value) => {
                setGenre(value || null);
                setPage(1);
              }}
              searchable
            />
            <Select
              label={t("media.filters.language")}
              data={[
                { value: "", label: t("media.all") },
                ...languageOptions
              ]}
              value={language || ""}
              onChange={(value) => {
                setLanguage(value || null);
                setPage(1);
              }}
              searchable
            />
            <Select
              label={t("media.filters.resolution")}
              data={[
                { value: "", label: t("media.all") },
                ...((result?.aggregations.videoResolution || [])
                  .filter((item) => !!item.value)
                  .map((item) => ({
                    value: item.value || "",
                    label: `${item.label} (${item.count})`
                  })))
              ]}
              value={resolution || ""}
              onChange={(value) => {
                setResolution(value || null);
                setPage(1);
              }}
            />
            <Select
              label={t("media.filters.year")}
              data={[
                { value: "", label: t("media.all") },
                ...((result?.aggregations.releaseYear || [])
                  .filter((item) => item.value != null)
                  .map((item) => ({
                    value: String(item.value),
                    label: `${item.label} (${item.count})`
                  })))
              ]}
              value={year || ""}
              onChange={(value) => {
                setYear(value || null);
                setPage(1);
              }}
            />
          </SimpleGrid>
          <Text size="sm" c="dimmed">
            {t("media.results")}: {result?.totalCount || 0}
          </Text>
        </Stack>
      </Card>

      {loading ? (
        <Card className="glass-card" withBorder>
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        </Card>
      ) : (result?.items.length || 0) === 0 ? (
        <Card className="glass-card" withBorder>
          <Text c="dimmed">{t("media.noResults")}</Text>
        </Card>
      ) : (
        <div className="media-masonry">
          {(result?.items || []).map((item) => {
            const poster = item.content?.attributes?.find(
              (attr) => attr.source === "tmdb" && attr.key === "poster_path"
            )?.value;

            const genres =
              item.content?.collections
                ?.filter((collection) => collection.type === "genre")
                .map((collection) => collection.name)
                .slice(0, 2) || [];

            const displayTitle = item.content?.title || item.title || item.torrent.name;
            const releaseYear = item.content?.releaseYear || "-";
            const detailHref = `/torrents/${item.infoHash}`;

            return (
              <Card key={item.infoHash} className="glass-card media-masonry-item" withBorder>
                <Stack gap="sm">
                  {poster ? (
                    <Link href={detailHref} style={{ textDecoration: "none" }}>
                      <Image
                        src={`https://image.tmdb.org/t/p/w342/${poster.replace(/^\/+/, "")}`}
                        alt={displayTitle}
                        radius="md"
                        fit="contain"
                      />
                    </Link>
                  ) : (
                    <Group justify="center" bg="var(--mantine-color-dark-6)" style={{ borderRadius: "var(--mantine-radius-md)", minHeight: 200 }}>
                      <Text c="dimmed">{t("media.noPoster")}</Text>
                    </Group>
                  )}

                  <Stack gap={4}>
                    <Link href={detailHref} style={{ textDecoration: "none", color: "inherit" }}>
                      <Text fw={700} lineClamp={2}>
                        {displayTitle}
                      </Text>
                    </Link>
                    <Group gap={6}>
                      <Badge size="xs" variant="light">{releaseYear}</Badge>
                      <Badge size="xs" variant="light" color="blue">{displayResolution(item.videoResolution)}</Badge>
                      <Badge size="xs" variant="light" color="green">{t("torrents.table.seeders")}: {item.seeders ?? 0}</Badge>
                    </Group>
                    {!!genres.length && (
                      <Group gap={6}>
                        {genres.map((genreName) => (
                          <Badge key={genreName} size="xs" color="grape" variant="outline">
                            {translateFacetLabel("genres", genreName, genreName)}
                          </Badge>
                        ))}
                      </Group>
                    )}
                    <Text size="sm" c="dimmed" lineClamp={4}>{item.content?.overview || item.torrent.name}</Text>
                    <Text size="xs" c="dimmed">{t("media.size")}: {formatBytes(item.torrent.size)}</Text>
                    <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>{item.infoHash}</Text>
                  </Stack>
                </Stack>
              </Card>
            );
          })}
        </div>
      )}

      <Group justify="flex-end">
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>
    </Stack>
  );
}

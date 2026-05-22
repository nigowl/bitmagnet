"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Badge,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useI18n } from "@/languages/provider";
import { fetchMediaList, type MediaListItem } from "@/lib/media-api";
import {
  MEDIA_FILTER_KEYS_BY_CATEGORY,
  MEDIA_LIST_TARGET_COUNT,
  type FilterOption,
  type FilterRowKey,
  type MediaCategory,
  normalizeSimpleValue,
  resolveAdaptiveMediaListCount
} from "./media-page.helpers";
import { MediaResultsSection } from "./media-page.results";
import { MediaToolbar } from "./media-page.toolbar";

export function MediaPage({ fixedCategory }: { fixedCategory: MediaCategory }) {
  const { t, locale } = useI18n();
  const titleLanguage = locale === "en" ? "en" : "zh";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [mediaLayoutElement, setMediaLayoutElement] = useState<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState(MEDIA_LIST_TARGET_COUNT);
  const [searchInput, setSearchInput] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<FilterRowKey, boolean>>({
    quality: false,
    year: false,
    genre: false,
    language: false,
    country: false,
    network: false,
    studio: false,
    awards: false,
    sort: false
  });
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalTorrentCount, setTotalTorrentCount] = useState(0);
  const [resolvedPageBoundsKey, setResolvedPageBoundsKey] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const setMediaLayoutRef = useCallback((node: HTMLDivElement | null) => {
    setMediaLayoutElement(node);
  }, []);

  const quality = normalizeSimpleValue(searchParams.get("quality"), "all");
  const year = normalizeSimpleValue(searchParams.get("year"), "all");
  const genre = normalizeSimpleValue(searchParams.get("genre"), "all");
  const language = normalizeSimpleValue(searchParams.get("language"), "all");
  const country = normalizeSimpleValue(searchParams.get("country"), "all");
  const network = normalizeSimpleValue(searchParams.get("network"), "all");
  const studio = normalizeSimpleValue(searchParams.get("studio"), "all");
  const awards = normalizeSimpleValue(searchParams.get("awards"), "all");
  const cache = normalizeSimpleValue(searchParams.get("cache"), "all");
  const sort = normalizeSimpleValue(searchParams.get("sort"), "popular");
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const searchValue = searchParams.get("search") || "";
  const enabledFilterKeys = useMemo(
    () => new Set<FilterRowKey>(MEDIA_FILTER_KEYS_BY_CATEGORY[fixedCategory]),
    [fixedCategory]
  );
  const currentListHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    setSearchInput(searchValue);
  }, [searchValue]);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "all" || (key === "sort" && value === "popular")) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const commitSearch = useCallback(() => {
    const nextSearch = searchInput.trim();
    if (nextSearch === searchValue.trim()) return;
    updateQuery({
      search: nextSearch || null,
      page: null
    });
  }, [searchInput, searchValue, updateQuery]);

  useLayoutEffect(() => {
    const element = mediaLayoutElement;
    if (!element) return;

    let frameId: number | null = null;
    const updatePageSize = () => {
      const next = resolveAdaptiveMediaListCount(element.clientWidth, MEDIA_LIST_TARGET_COUNT);
      setPageSize((current) => (current === next ? current : next));
    };
    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updatePageSize();
      });
    };

    scheduleUpdate();
    const settleTimer = window.setTimeout(scheduleUpdate, 0);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    } else {
      window.addEventListener("resize", scheduleUpdate, { passive: true });
    }

    return () => {
      window.clearTimeout(settleTimer);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener("resize", scheduleUpdate);
      }
    };
  }, [mediaLayoutElement, pathname]);

  const pageBoundsKey = useMemo(
    () =>
      JSON.stringify({
        fixedCategory,
        searchValue,
        quality,
        year,
        genre,
        language,
        country: enabledFilterKeys.has("country") ? country : "all",
        network: enabledFilterKeys.has("network") ? network : "all",
        studio: enabledFilterKeys.has("studio") ? studio : "all",
        awards: enabledFilterKeys.has("awards") ? awards : "all",
        cache,
        sort,
        pageSize
      }),
    [awards, cache, country, enabledFilterKeys, fixedCategory, genre, language, network, pageSize, quality, searchValue, sort, studio, year]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMediaList({
        category: fixedCategory,
        search: searchValue || undefined,
        quality,
        year,
        genre,
        language,
        country: enabledFilterKeys.has("country") ? country : "all",
        network: enabledFilterKeys.has("network") ? network : "all",
        studio: enabledFilterKeys.has("studio") ? studio : "all",
        awards: enabledFilterKeys.has("awards") ? awards : "all",
        cache,
        sort,
        limit: pageSize,
        page
      });
      setItems(data.items || []);
      setTotalCount(data.totalCount || 0);
      setTotalTorrentCount(data.totalTorrentCount || 0);
      setResolvedPageBoundsKey(pageBoundsKey);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [awards, cache, country, enabledFilterKeys, fixedCategory, genre, language, network, page, pageBoundsKey, pageSize, quality, searchValue, sort, studio, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [pageSize, totalCount]);

  useEffect(() => {
    if (resolvedPageBoundsKey !== pageBoundsKey) return;
    if (loading) return;
    if (page <= totalPages) return;
    updateQuery({ page: String(totalPages) });
  }, [loading, page, pageBoundsKey, resolvedPageBoundsKey, totalPages, updateQuery]);

  const yearOptions = useMemo<FilterOption[]>(() => {
    const currentYear = new Date().getFullYear();
    return [
      { value: "all", label: t("media.all") },
      { value: "upcoming", label: t("media.year.upcoming") },
      ...Array.from({ length: 7 }, (_, index) => {
        const value = String(currentYear - index);
        return { value, label: value };
      }),
      { value: "2010s", label: t("media.year.2010s") },
      { value: "2000s", label: t("media.year.2000s") },
      { value: "1990s", label: t("media.year.1990s") },
      { value: "1980s", label: t("media.year.1980s") },
      { value: "1970s", label: t("media.year.1970s") },
      { value: "1960s", label: t("media.year.1960s") },
      { value: "1950s", label: t("media.year.1950s") },
      { value: "older", label: t("media.year.older") }
    ];
  }, [t]);

  const qualityOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "3d", label: "3D" },
      { value: "dolby_vision", label: "Dolby Vision" },
      { value: "4k", label: "4K" },
      { value: "1080p", label: "1080P" },
      { value: "720p", label: "720P" },
      { value: "480p", label: "480P" },
      { value: "360p", label: "360P" }
    ],
    [t]
  );

  const genreOptions = useMemo<FilterOption[]>(() => {
    const categoryGenres: Record<MediaCategory, string[]> = {
      movie: [
        "animation",
        "action",
        "adventure",
        "science_fiction",
        "thriller",
        "crime",
        "comedy",
        "drama",
        "romance",
        "horror",
        "fantasy",
        "family",
        "documentary",
        "history",
        "war",
        "music",
        "western"
      ],
      series: [
        "animation",
        "drama",
        "comedy",
        "crime",
        "mystery",
        "thriller",
        "science_fiction",
        "fantasy",
        "action",
        "adventure",
        "romance",
        "documentary",
        "kids",
        "family"
      ],
      anime: [
        "animation",
        "action",
        "adventure",
        "fantasy",
        "science_fiction",
        "comedy",
        "drama",
        "romance",
        "mystery",
        "family"
      ]
    };
    return [
      { value: "all", label: t("media.all") },
      ...categoryGenres[fixedCategory].map((value) => ({
        value,
        label: t(`media.genres.${value}`)
      }))
    ];
  }, [fixedCategory, t]);

  const sortOptions = useMemo<FilterOption[]>(
    () => [
      { value: "popular", label: t("media.sort.popular") },
      { value: "latest", label: t("media.sort.latest") },
      { value: "download", label: t("media.sort.download") },
      { value: "rating", label: t("media.sort.rating") },
      { value: "updated", label: t("media.sort.updated") }
    ],
    [t]
  );

  const languageOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "english", label: t("media.languages.english") },
      { value: "chinese", label: t("media.languages.chinese") },
      { value: "japanese", label: t("media.languages.japanese") },
      { value: "korean", label: t("media.languages.korean") },
      { value: "french", label: t("media.languages.french") },
      { value: "german", label: t("media.languages.german") },
      { value: "spanish", label: t("media.languages.spanish") },
      { value: "italian", label: t("media.languages.italian") },
      { value: "russian", label: t("media.languages.russian") },
      { value: "portuguese", label: t("media.languages.portuguese") },
      { value: "hindi", label: t("media.languages.hindi") }
    ],
    [t]
  );

  const countryOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "united_states", label: t("media.countries.united_states") },
      { value: "china", label: t("media.countries.china") },
      { value: "japan", label: t("media.countries.japan") },
      { value: "south_korea", label: t("media.countries.south_korea") },
      { value: "united_kingdom", label: t("media.countries.united_kingdom") },
      { value: "france", label: t("media.countries.france") },
      { value: "germany", label: t("media.countries.germany") },
      { value: "india", label: t("media.countries.india") },
      { value: "thailand", label: t("media.countries.thailand") },
      { value: "hong_kong", label: t("media.countries.hong_kong") },
      { value: "taiwan", label: t("media.countries.taiwan") },
      { value: "spain", label: t("media.countries.spain") }
    ],
    [t]
  );

  const networkOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "netflix", label: "Netflix" },
      { value: "disney_plus", label: "Disney+" },
      { value: "hbo", label: "HBO / Max" },
      { value: "apple_tv_plus", label: "Apple TV+" },
      { value: "prime_video", label: "Prime Video" },
      { value: "hulu", label: "Hulu" },
      { value: "bbc", label: "BBC" },
      { value: "nhk", label: "NHK" },
      { value: "tencent_video", label: t("media.networks.tencent_video") },
      { value: "iqiyi", label: t("media.networks.iqiyi") },
      { value: "youku", label: t("media.networks.youku") }
    ],
    [t]
  );

  const studioOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "marvel_studios", label: "Marvel Studios" },
      { value: "disney", label: "Disney" },
      { value: "warner_bros", label: "Warner Bros." },
      { value: "a24", label: "A24" },
      { value: "pixar", label: "Pixar" },
      { value: "dreamworks", label: "DreamWorks" },
      { value: "studio_ghibli", label: "Studio Ghibli" },
      { value: "toei_animation", label: "Toei Animation" },
      { value: "mappa", label: "MAPPA" },
      { value: "netflix", label: "Netflix" },
      { value: "hbo", label: "HBO" }
    ],
    [t]
  );

  const awardsOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "oscar", label: t("media.awards.oscar") },
      { value: "emmy", label: t("media.awards.emmy") },
      { value: "golden_globe", label: t("media.awards.golden_globe") },
      { value: "cannes", label: t("media.awards.cannes") },
      { value: "berlin", label: t("media.awards.berlin") },
      { value: "venice", label: t("media.awards.venice") },
      { value: "bafta", label: t("media.awards.bafta") },
      { value: "sundance", label: t("media.awards.sundance") }
    ],
    [t]
  );

  const clearFilters = () => {
    setSearchInput("");
    router.replace(pathname, { scroll: false });
  };

  const setExpanded = (key: FilterRowKey) => {
    setExpandedRows((current) => ({ ...current, [key]: !current[key] }));
  };

  const pageTitle = fixedCategory === "movie"
    ? t("media.category.movieTitle")
    : fixedCategory === "series"
      ? t("media.category.seriesTitle")
      : t("media.category.animeTitle");
  const pageSubtitle = fixedCategory === "movie"
    ? t("media.category.movieSubtitle")
    : fixedCategory === "series"
      ? t("media.category.seriesSubtitle")
      : t("media.category.animeSubtitle");

  return (
    <div ref={setMediaLayoutRef} className="media-cinema-shell">
      <Card className="glass-card media-hero-panel" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Title order={1}>{pageTitle}</Title>
              <Text c="dimmed" mt={6}>{pageSubtitle}</Text>
            </div>
            <Group gap="xs">
              <Badge variant="light" color="orange">{t("media.results")}: {totalCount}</Badge>
              <Badge variant="outline">{t("media.torrentCount")}: {totalTorrentCount}</Badge>
            </Group>
          </Group>

          <MediaToolbar
            t={t}
            searchInput={searchInput}
            cache={cache}
            showAdvancedFilters={showAdvancedFilters}
            expandedRows={expandedRows}
            enabledFilterKeys={enabledFilterKeys}
            values={{ quality, year, genre, language, country, network, studio, awards, sort }}
            options={{
              quality: qualityOptions,
              year: yearOptions,
              genre: genreOptions,
              language: languageOptions,
              country: countryOptions,
              network: networkOptions,
              studio: studioOptions,
              awards: awardsOptions,
              sort: sortOptions
            }}
            onSearchChange={setSearchInput}
            onCommitSearch={commitSearch}
            onToggleCache={() => updateQuery({ cache: cache === "cached" ? null : "cached", page: null })}
            onClearFilters={clearFilters}
            onRefresh={() => void load()}
            onToggleAdvancedFilters={() => setShowAdvancedFilters((value) => !value)}
            onToggleExpanded={setExpanded}
            onSelectFilter={(key, value) => updateQuery({ [key]: value, page: null })}
          />
        </Stack>
      </Card>

      <MediaResultsSection
        t={t}
        loading={loading}
        items={items}
        titleLanguage={titleLanguage}
        currentListHref={currentListHref}
        totalCount={totalCount}
        page={page}
        totalPages={totalPages}
        onChangePage={(value) => updateQuery({ page: String(value) })}
      />
    </div>
  );
}

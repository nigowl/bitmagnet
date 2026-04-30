"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Loader,
  Pagination,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { ChevronDown, ChevronUp, FilterX, HardDriveDownload, ListOrdered, RefreshCw, Search, Users } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { useI18n } from "@/languages/provider";
import { fetchMediaList, type MediaListItem } from "@/lib/media-api";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getPosterUrl, pickBestQualityTag } from "@/lib/media";

type MediaCategory = "movie" | "series" | "anime";
type FilterRowKey = "quality" | "cache" | "year" | "genre" | "language" | "country" | "network" | "studio" | "awards" | "sort";
const MEDIA_LIST_TARGET_COUNT = 40;
const MEDIA_LIST_MIN_CARD_WIDTH = 188;
const MEDIA_LIST_GRID_GAP = 16;
const MEDIA_FILTER_KEYS_BY_CATEGORY: Record<MediaCategory, FilterRowKey[]> = {
  movie: ["quality", "cache", "year", "genre", "language", "country", "studio", "awards", "sort"],
  series: ["quality", "cache", "year", "genre", "language", "country", "network", "sort"],
  anime: ["quality", "cache", "year", "genre", "language", "studio", "sort"]
};

type FilterOption = {
  value: string;
  label: string;
};

function normalizeSimpleValue(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeMediaToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function localizeGenreLabel(value: string, t: (key: string) => string): string {
  const normalized = normalizeMediaToken(value);
  const aliases: Record<string, string> = {
    sciencefiction: "science_fiction",
    sci_fi: "sci_fi",
    sci_fi_and_fantasy: "science_fiction",
    action_and_adventure: "action_adventure",
    war_and_politics: "war_politics"
  };
  const key = aliases[normalized] || normalized;
  const translationKey = `media.genres.${key}`;
  const translated = t(translationKey);
  return translated === translationKey ? value : translated;
}

function resolveAdaptiveMediaListCount(containerWidth: number, targetCount: number = MEDIA_LIST_TARGET_COUNT): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return targetCount;
  }
  const columns = Math.max(1, Math.floor((containerWidth + MEDIA_LIST_GRID_GAP) / (MEDIA_LIST_MIN_CARD_WIDTH + MEDIA_LIST_GRID_GAP)));
  const lower = Math.max(columns, Math.floor(targetCount / columns) * columns);
  const upper = Math.max(columns, Math.ceil(targetCount / columns) * columns);
  if (Math.abs(targetCount - lower) <= Math.abs(upper - targetCount)) {
    return lower;
  }
  return upper;
}

function FilterRow({
  label,
  currentValue,
  options,
  expanded,
  onToggleExpand,
  onSelect
}: {
  label: string;
  currentValue: string;
  options: FilterOption[];
  expanded: boolean;
  onToggleExpand?: () => void;
  onSelect: (value: string) => void;
}) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [canExpand, setCanExpand] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(52);
  const [expandedHeight, setExpandedHeight] = useState(240);
  const isExpanded = expanded && canExpand;

  useLayoutEffect(() => {
    const element = optionsRef.current;
    if (!element) return;
    let frameId: number | null = null;

    const updateLayout = () => {
      const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (children.length === 0) {
        setCanExpand(false);
        setCollapsedHeight(52);
        setExpandedHeight(52);
        return;
      }

      const firstRowTop = children[0].offsetTop;
      const firstRowItems = children.filter((child) => child.offsetTop === firstRowTop);
      const firstRowBottom = Math.max(...firstRowItems.map((child) => child.offsetTop + child.offsetHeight));
      const hasOverflow = children.some((child) => child.offsetTop > firstRowTop);

      setCanExpand(hasOverflow);
      setCollapsedHeight(firstRowBottom);
      setExpandedHeight(element.scrollHeight);
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateLayout();
      });
    };

    scheduleUpdate();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    } else {
      window.addEventListener("resize", scheduleUpdate, { passive: true });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener("resize", scheduleUpdate);
      }
    };
  }, [options, expanded]);

  return (
    <div
      className="media-filter-row"
      data-expandable={canExpand ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
    >
      <div className="media-filter-label">{label}</div>
      <div
        ref={optionsRef}
        className={isExpanded ? "media-filter-options media-filter-options-expanded" : "media-filter-options media-filter-options-collapsed"}
        style={{ maxHeight: `${isExpanded ? expandedHeight : collapsedHeight}px` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={currentValue === option.value ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {canExpand ? (
        <button
          type="button"
          className="media-filter-expand"
          onClick={onToggleExpand}
          aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      ) : null}
    </div>
  );
}

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
    cache: false,
    sort: false
  });
  const [debouncedSearch] = useDebouncedValue(searchInput, 250);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalTorrentCount, setTotalTorrentCount] = useState(0);
  const [resolvedPageBoundsKey, setResolvedPageBoundsKey] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const advancedFiltersRef = useRef<HTMLDivElement | null>(null);
  const [advancedFiltersHeight, setAdvancedFiltersHeight] = useState(0);

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

  useEffect(() => {
    if (debouncedSearch === searchValue) return;
    updateQuery({
      search: debouncedSearch.trim() || null,
      page: null
    });
  }, [debouncedSearch, searchValue, updateQuery]);

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

  const cacheOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: t("media.all") },
      { value: "cached", label: t("media.cacheBadge") }
    ],
    [t]
  );

  const genreOptions = useMemo<FilterOption[]>(() => {
    const categoryGenres: Record<MediaCategory, string[]> = {
      movie: [
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
        "animation",
        "family",
        "documentary",
        "history",
        "war",
        "music",
        "western"
      ],
      series: [
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

  const syncAdvancedFiltersHeight = useCallback(() => {
    const element = advancedFiltersRef.current;
    if (!element) return;
    const nextHeight = element.scrollHeight;
    setAdvancedFiltersHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  useLayoutEffect(() => {
    if (!showAdvancedFilters) return;
    let frameId: number | null = window.requestAnimationFrame(() => {
      frameId = null;
      syncAdvancedFiltersHeight();
    });
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    awardsOptions,
    countryOptions,
    cacheOptions,
    expandedRows,
    genreOptions,
    languageOptions,
    networkOptions,
    qualityOptions,
    showAdvancedFilters,
    sortOptions,
    studioOptions,
    syncAdvancedFiltersHeight,
    yearOptions
  ]);

  useEffect(() => {
    if (!showAdvancedFilters) return;
    let frameId: number | null = null;
    const scheduleSync = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncAdvancedFiltersHeight();
      });
    };
    window.addEventListener("resize", scheduleSync, { passive: true });
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
    };
  }, [showAdvancedFilters, syncAdvancedFiltersHeight]);

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

          <Card className="glass-card media-toolbar media-toolbar-rich" withBorder>
            <div className="media-toolbar-actions">
              <TextInput
                leftSection={<Search size={16} />}
                placeholder={t("media.search")}
                value={searchInput}
                onChange={(event) => setSearchInput(event.currentTarget.value)}
                className="media-toolbar-search"
              />
              <Group gap="xs">
                <Tooltip label={t("media.cacheBadge")} withArrow>
                  <ActionIcon
                    className="app-icon-btn"
                    variant="default"
                    size={36}
                    onClick={() => updateQuery({ cache: cache === "cached" ? null : "cached", page: null })}
                    aria-label={t("media.cacheBadge")}
                    title={t("media.cacheBadge")}
                  >
                    <HardDriveDownload size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("media.clearFilters")} withArrow>
                  <ActionIcon
                    className="app-icon-btn"
                    variant="default"
                    size={36}
                    onClick={clearFilters}
                    aria-label={t("media.clearFilters")}
                    title={t("media.clearFilters")}
                  >
                    <FilterX size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("common.refresh")} withArrow>
                  <ActionIcon
                    className="app-icon-btn"
                    variant="default"
                    size={36}
                    onClick={() => void load()}
                    aria-label={t("common.refresh")}
                    title={t("common.refresh")}
                  >
                    <RefreshCw size={16} />
                  </ActionIcon>
                </Tooltip>
                <ActionIcon
                  className="app-icon-btn media-advanced-toggle"
                  data-expanded={showAdvancedFilters ? "true" : "false"}
                  variant="default"
                  size={36}
                  onClick={() => setShowAdvancedFilters((value) => !value)}
                  aria-label={showAdvancedFilters ? t("media.collapseFilters") : t("media.expandFilters")}
                >
                  <ChevronDown size={16} />
                </ActionIcon>
              </Group>
            </div>

            <div
              className={showAdvancedFilters ? "media-advanced-filters media-advanced-filters-open" : "media-advanced-filters"}
              style={{ maxHeight: showAdvancedFilters ? advancedFiltersHeight : 0 }}
              aria-hidden={!showAdvancedFilters}
            >
              <div ref={advancedFiltersRef} className="media-advanced-filters-inner">
                <FilterRow
                  label={t("media.filters.quality")}
                  currentValue={quality}
                  options={qualityOptions}
                  expanded={expandedRows.quality}
                  onToggleExpand={() => setExpanded("quality")}
                  onSelect={(value) => updateQuery({ quality: value, page: null })}
                />

                <FilterRow
                  label={t("media.filters.cache")}
                  currentValue={cache}
                  options={cacheOptions}
                  expanded={expandedRows.cache}
                  onToggleExpand={() => setExpanded("cache")}
                  onSelect={(value) => updateQuery({ cache: value, page: null })}
                />

                <FilterRow
                  label={t("media.filters.year")}
                  currentValue={year}
                  options={yearOptions}
                  expanded={expandedRows.year}
                  onToggleExpand={() => setExpanded("year")}
                  onSelect={(value) => updateQuery({ year: value, page: null })}
                />

                <FilterRow
                  label={t("media.filters.genre")}
                  currentValue={genre}
                  options={genreOptions}
                  expanded={expandedRows.genre}
                  onToggleExpand={() => setExpanded("genre")}
                  onSelect={(value) => updateQuery({ genre: value, page: null })}
                />

                <FilterRow
                  label={t("media.filters.language")}
                  currentValue={language}
                  options={languageOptions}
                  expanded={expandedRows.language}
                  onToggleExpand={() => setExpanded("language")}
                  onSelect={(value) => updateQuery({ language: value, page: null })}
                />

                {enabledFilterKeys.has("country") ? (
                  <FilterRow
                    label={t("media.filters.country")}
                    currentValue={country}
                    options={countryOptions}
                    expanded={expandedRows.country}
                    onToggleExpand={() => setExpanded("country")}
                    onSelect={(value) => updateQuery({ country: value, page: null })}
                  />
                ) : null}

                {enabledFilterKeys.has("network") ? (
                  <FilterRow
                    label={t("media.filters.network")}
                    currentValue={network}
                    options={networkOptions}
                    expanded={expandedRows.network}
                    onToggleExpand={() => setExpanded("network")}
                    onSelect={(value) => updateQuery({ network: value, page: null })}
                  />
                ) : null}

                {enabledFilterKeys.has("studio") ? (
                  <FilterRow
                    label={t("media.filters.studio")}
                    currentValue={studio}
                    options={studioOptions}
                    expanded={expandedRows.studio}
                    onToggleExpand={() => setExpanded("studio")}
                    onSelect={(value) => updateQuery({ studio: value, page: null })}
                  />
                ) : null}

                {enabledFilterKeys.has("awards") ? (
                  <FilterRow
                    label={t("media.filters.awards")}
                    currentValue={awards}
                    options={awardsOptions}
                    expanded={expandedRows.awards}
                    onToggleExpand={() => setExpanded("awards")}
                    onSelect={(value) => updateQuery({ awards: value, page: null })}
                  />
                ) : null}

                <FilterRow
                  label={t("media.filters.sort")}
                  currentValue={sort}
                  options={sortOptions}
                  expanded={expandedRows.sort}
                  onToggleExpand={() => setExpanded("sort")}
                  onSelect={(value) => updateQuery({ sort: value, page: null })}
                />
              </div>
            </div>
          </Card>
        </Stack>
      </Card>

      {loading ? (
        <Card className="glass-card" withBorder>
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        </Card>
      ) : items.length === 0 ? (
        <Card className="glass-card" withBorder>
          <Text c="dimmed">{t("media.noResults")}</Text>
        </Card>
      ) : (
        <>
          <div className="media-wall">
            {items.map((item) => {
              const poster = getPosterUrl(item, "md");
              const titleText = getDisplayTitle(item, titleLanguage);
              const originalTitleText = getDisplayTitle(item, "original");
              const qualityTags = Array.from(new Set((item.qualityTags ?? []).map((tag) => tag.trim()).filter(Boolean)));
              const genreTags = Array.from(new Set((item.genres ?? []).filter(Boolean)));
              const primaryQuality = pickBestQualityTag(qualityTags);
              const primaryGenre = genreTags[0] || null;
              const primaryGenreLabel = primaryGenre ? localizeGenreLabel(primaryGenre, t) : null;
              const originalTitle = originalTitleText.trim().toLowerCase() !== titleText.trim().toLowerCase()
                ? originalTitleText
                : null;
              const categoryLabel = item.isAnime
                ? t("nav.anime")
                : (item.contentType ? t(`contentTypes.${item.contentType}`) : null);
              const factGroups = extractMediaFacts({
                collections: item.collections ?? [],
                attributes: item.attributes ?? []
              });
              const factMap = new Map(factGroups.map((group) => [group.key, group.values]));
              const mediaMeta = [
                { label: t("media.filters.awards"), values: factMap.get("awards") ?? [] }
              ]
                .filter((entry) => entry.values.length > 0)
                .map((entry) => `${entry.label}: ${entry.values.slice(0, 2).join(" / ")}`);
              const infoLine = [item.releaseYear ? String(item.releaseYear) : null, primaryGenreLabel].filter(Boolean);
              const maxSeedersText = item.maxSeeders != null ? String(item.maxSeeders) : "-";

              return (
                <div key={item.id} className="media-wall-item">
                  <Link href={buildMediaDetailHref(item, currentListHref)} className="unstyled-link">
                    <article className="media-wall-card">
                      {item.hasCache ? (
                        <div className="media-cache-corner" aria-label={t("media.cacheBadge")}>
                          <span>{t("media.cacheBadge")}</span>
                        </div>
                      ) : null}
                      <div className="media-wall-poster-shell">
                        {poster ? (
                          <CoverImage className="media-wall-poster" src={poster} alt={titleText} />
                        ) : (
                          <div className="media-wall-poster media-wall-poster-fallback">
                            <Text c="dimmed" size="sm">{t("media.noPoster")}</Text>
                          </div>
                        )}
                        <div className="media-wall-overlay media-wall-overlay-top">
                          <div className="media-wall-overlay-group">
                            {categoryLabel ? <span className="media-poster-chip media-poster-chip-type">{categoryLabel}</span> : null}
                          </div>
                          {primaryQuality ? <span className="media-poster-chip media-poster-chip-highlight">{primaryQuality}</span> : null}
                        </div>
                        <div className="media-wall-overlay media-wall-overlay-bottom">
                          <div className="media-wall-overlay-group">
                            <span className="media-poster-chip">
                              <ListOrdered size={12} />
                              {item.torrentCount}
                            </span>
                            {item.maxSeeders != null ? (
                              <span className="media-poster-chip">
                                <Users size={12} />
                                {maxSeedersText}
                              </span>
                            ) : null}
                          </div>
                          {item.voteAverage ? <span className="media-rating-pill">★ {item.voteAverage.toFixed(1)}</span> : null}
                        </div>
                      </div>

                      <div className="media-wall-content">
                        {originalTitle ? <div className="media-wall-subtitle">{originalTitle}</div> : null}
                        <div className="media-wall-title">{titleText}</div>
                        {infoLine.length > 0 ? <div className="media-wall-facts">{infoLine.join(" · ")}</div> : null}
                        {mediaMeta.length > 0 ? (
                          <div className="media-wall-meta">
                            {mediaMeta.map((meta) => (
                              <span key={`${item.id}:${meta}`} className="media-mini-chip">{meta}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  </Link>
                </div>
              );
            })}
          </div>

          <Card className="glass-card media-toolbar-pagination" withBorder>
            <Group justify="space-between" wrap="wrap">
              <Text c="dimmed" size="sm">{t("media.results")}: {totalCount} / Page {page}</Text>
              <Pagination
                total={totalPages}
                value={page}
                onChange={(value) => updateQuery({ page: String(value) })}
                siblings={1}
                boundaries={1}
              />
            </Group>
          </Card>
        </>
      )}
    </div>
  );
}

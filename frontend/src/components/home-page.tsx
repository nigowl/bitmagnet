"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Card, Group, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ChevronLeft, ChevronRight, ListOrdered, Users } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { CoverImage } from "@/components/cover-image";
import { useI18n } from "@/languages/provider";
import { fetchMediaList, type MediaListItem } from "@/lib/media-api";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getPosterUrl, pickBestQualityTag } from "@/lib/media";

const HOME_SECTION_TARGET_COUNT = 20;
const HOME_SECTION_POOL_LIMIT = 48;
const HOME_SECTION_MIN_CARD_WIDTH = 188;
const HOME_SECTION_GRID_GAP = 16;
const HIGH_SCORE_FETCH_MAX_PAGES = 8;
const DAILY_CAROUSEL_INTERVAL_MS = 5600;

type HomeSettings = {
  daily: {
    refreshHour: number;
    poolLimit: number;
  };
  hot: {
    days: number;
  };
  highScore: {
    poolLimit: number;
    minScore: number;
    maxScore: number;
    window: number;
  };
};

const DEFAULT_HOME_SETTINGS: HomeSettings = {
  daily: {
    refreshHour: 2,
    poolLimit: 96
  },
  hot: {
    days: 30
  },
  highScore: {
    poolLimit: 120,
    minScore: 8,
    maxScore: 9.9,
    window: 1
  }
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAdaptiveSectionCount(containerWidth: number, targetCount: number = HOME_SECTION_TARGET_COUNT): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return targetCount;
  }
  const columns = Math.max(1, Math.floor((containerWidth + HOME_SECTION_GRID_GAP) / (HOME_SECTION_MIN_CARD_WIDTH + HOME_SECTION_GRID_GAP)));
  const lower = Math.max(columns, Math.floor(targetCount / columns) * columns);
  const upper = Math.max(columns, Math.ceil(targetCount / columns) * columns);
  if (Math.abs(targetCount - lower) <= Math.abs(upper - targetCount)) {
    return lower;
  }
  return upper;
}

function normalizeHomeSettings(input: unknown): HomeSettings {
  const raw = (input && typeof input === "object") ? (input as Partial<HomeSettings>) : {};
  const rawDaily: Partial<HomeSettings["daily"]> = (raw.daily && typeof raw.daily === "object")
    ? (raw.daily as Partial<HomeSettings["daily"]>)
    : {};
  const rawHot: Partial<HomeSettings["hot"]> = (raw.hot && typeof raw.hot === "object")
    ? (raw.hot as Partial<HomeSettings["hot"]>)
    : {};
  const rawHigh: Partial<HomeSettings["highScore"]> = (raw.highScore && typeof raw.highScore === "object")
    ? (raw.highScore as Partial<HomeSettings["highScore"]>)
    : {};

  const refreshHour = typeof rawDaily.refreshHour === "number"
    ? clampNumber(Math.round(rawDaily.refreshHour), 0, 23)
    : DEFAULT_HOME_SETTINGS.daily.refreshHour;
  const dailyPoolLimit = typeof rawDaily.poolLimit === "number"
    ? clampNumber(Math.round(rawDaily.poolLimit), 24, 240)
    : DEFAULT_HOME_SETTINGS.daily.poolLimit;
  const hotDays = typeof rawHot.days === "number"
    ? clampNumber(Math.round(rawHot.days), 1, 3650)
    : DEFAULT_HOME_SETTINGS.hot.days;

  const minScore = typeof rawHigh.minScore === "number"
    ? clampNumber(rawHigh.minScore, 0, 10)
    : DEFAULT_HOME_SETTINGS.highScore.minScore;
  const maxScoreCandidate = typeof rawHigh.maxScore === "number"
    ? clampNumber(rawHigh.maxScore, 0, 10)
    : DEFAULT_HOME_SETTINGS.highScore.maxScore;
  const maxScore = Math.max(minScore, maxScoreCandidate);
  const window = typeof rawHigh.window === "number"
    ? clampNumber(rawHigh.window, 0.1, 10)
    : DEFAULT_HOME_SETTINGS.highScore.window;
  const highScorePoolLimit = typeof rawHigh.poolLimit === "number"
    ? clampNumber(Math.round(rawHigh.poolLimit), 24, 240)
    : DEFAULT_HOME_SETTINGS.highScore.poolLimit;

  return {
    daily: {
      refreshHour,
      poolLimit: dailyPoolLimit
    },
    hot: {
      days: hotDays
    },
    highScore: {
      poolLimit: highScorePoolLimit,
      minScore,
      maxScore,
      window
    }
  };
}

function buildRecommendationDayToken(refreshHour: number, now: Date = new Date()): number {
  const shifted = new Date(now.getTime() - (refreshHour * 60 * 60 * 1000));
  const year = shifted.getFullYear();
  const month = shifted.getMonth() + 1;
  const date = shifted.getDate();
  return (year * 10000) + (month * 100) + date;
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function stringSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickDailyRecommendations(items: MediaListItem[], count: number, dayToken: number): MediaListItem[] {
  if (items.length <= count) return items;
  const start = dayToken % items.length;
  const rotated = [...items.slice(start), ...items.slice(0, start)];
  return rotated.slice(0, count);
}

function pickHighScoreRecommendations(
  items: MediaListItem[],
  count: number,
  dayToken: number
): MediaListItem[] {
  if (items.length <= count) return items;
  const randomized = [...items].sort((left, right) => {
    const leftSeed = seededUnit(dayToken + (stringSeed(String(left.id || "")) * 0.001));
    const rightSeed = seededUnit(dayToken + (stringSeed(String(right.id || "")) * 0.001));
    if (leftSeed === rightSeed) {
      return String(left.id).localeCompare(String(right.id));
    }
    return leftSeed - rightSeed;
  });
  return randomized.slice(0, count);
}

async function fetchHighScorePool(
  config: HomeSettings["highScore"],
  minimumPoolSize: number
): Promise<MediaListItem[]> {
  const minScore = clampNumber(config.minScore, 0, 10);
  const maxScore = clampNumber(Math.max(config.maxScore, minScore), 0, 10);
  const targetPoolSize = Math.max(1, Math.round(Math.max(config.poolLimit, minimumPoolSize)));
  const perPage = Math.max(1, Math.min(120, targetPoolSize));
  const result: MediaListItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= HIGH_SCORE_FETCH_MAX_PAGES; page += 1) {
    const data = await fetchMediaList({
      sort: "rating",
      scoreMin: minScore,
      scoreMax: maxScore,
      limit: perPage,
      page
    });
    const items = data.items || [];
    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      const id = String(item.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(item);
    }

    if (result.length >= targetPoolSize || items.length < perPage) {
      break;
    }
  }

  return result.slice(0, targetPoolSize);
}

async function fetchHomeSettings(): Promise<HomeSettings> {
  try {
    const response = await apiRequest<{ home?: unknown }>("/api/settings/home");
    return normalizeHomeSettings(response.home);
  } catch {
    return DEFAULT_HOME_SETTINGS;
  }
}

function MediaWallCard({ item, t, titleLanguage, sourceHref }: {
  item: MediaListItem;
  t: (key: string) => string;
  titleLanguage: "zh" | "en";
  sourceHref: string;
}) {
  const poster = getPosterUrl(item, "md");
  const titleText = getDisplayTitle(item, titleLanguage);
  const originalTitleText = getDisplayTitle(item, "original");
  const qualityTags = Array.from(new Set((item.qualityTags ?? []).map((tag) => tag.trim()).filter(Boolean)));
  const primaryQuality = pickBestQualityTag(qualityTags);
  const categoryLabel = item.isAnime
    ? t("nav.anime")
    : (item.contentType ? t(`contentTypes.${item.contentType}`) : null);
  const factGroups = extractMediaFacts({
    collections: item.collections ?? [],
    attributes: item.attributes ?? []
  });
  const awards = factGroups.find((group) => group.key === "awards")?.values ?? [];
  const mediaMeta = awards.length > 0 ? [`${t("media.filters.awards")}: ${awards.slice(0, 2).join(" / ")}`] : [];
  const originalTitle = originalTitleText.trim().toLowerCase() !== titleText.trim().toLowerCase()
    ? originalTitleText
    : null;
  const maxSeedersText = item.maxSeeders != null ? String(item.maxSeeders) : "-";

  return (
    <div className="media-wall-item">
      <Link href={buildMediaDetailHref(item, sourceHref)} className="unstyled-link">
        <article className="media-wall-card home-media-card">
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
            {item.releaseYear ? <div className="media-wall-facts">{item.releaseYear}</div> : null}
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
}

function HomeSection({ title, items, displayLimit, loading, emptyText, t, titleLanguage, sourceHref }: {
  title: string;
  items: MediaListItem[];
  displayLimit: number;
  loading: boolean;
  emptyText: string;
  t: (key: string) => string;
  titleLanguage: "zh" | "en";
  sourceHref: string;
}) {
  const sectionItems = items.slice(0, displayLimit);

  return (
    <Stack gap="sm">
      <div className="da-section-title-wrap">
        <div className="da-section-title">{title}</div>
      </div>

      {loading ? (
        <Card className="glass-card" withBorder>
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        </Card>
      ) : sectionItems.length === 0 ? (
        <Card className="glass-card" withBorder>
          <Text c="dimmed">{emptyText}</Text>
        </Card>
      ) : (
        <div className="media-wall">
          {sectionItems.map((item) => (
            <MediaWallCard key={item.id} item={item} t={t} titleLanguage={titleLanguage} sourceHref={sourceHref} />
          ))}
        </div>
      )}
    </Stack>
  );
}

function DailyPicksCarousel({ title, items, displayLimit, loading, emptyText, t, titleLanguage, sourceHref }: {
  title: string;
  items: MediaListItem[];
  displayLimit: number;
  loading: boolean;
  emptyText: string;
  t: (key: string) => string;
  titleLanguage: "zh" | "en";
  sourceHref: string;
}) {
  const sectionItems = items.slice(0, displayLimit);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const loopResetTimerRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeVirtualIndex, setActiveVirtualIndex] = useState(displayLimit);
  const loopSize = sectionItems.length;
  const loopedItems = useMemo(
    () => (loopSize > 1 ? [...sectionItems, ...sectionItems, ...sectionItems] : sectionItems),
    [loopSize, sectionItems]
  );
  const renderedVirtualIndex = loopSize > 1
    ? (
      activeVirtualIndex >= 0 && activeVirtualIndex < loopSize * 3
        ? activeVirtualIndex
        : (((activeVirtualIndex % loopSize) + loopSize) % loopSize) + loopSize
    )
    : 0;

  const jumpToVirtualIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const scroller = trackRef.current;
    if (!scroller) return;
    const target = itemRefs.current[index];
    if (!target) return;
    const centeredLeft = target.offsetLeft - ((scroller.clientWidth - target.clientWidth) / 2);
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextLeft = Math.min(Math.max(0, centeredLeft), maxScrollLeft);
    scroller.scrollTo({ left: nextLeft, behavior });
  }, []);

  const scheduleLoopReset = useCallback((index: number) => {
    if (loopSize <= 1) return;
    if (loopResetTimerRef.current != null) {
      window.clearTimeout(loopResetTimerRef.current);
    }

    if (index >= loopSize * 2 || index < loopSize) {
      const normalized = (((index % loopSize) + loopSize) % loopSize) + loopSize;
      loopResetTimerRef.current = window.setTimeout(() => {
        setActiveVirtualIndex(normalized);
        jumpToVirtualIndex(normalized, "auto");
      }, 620);
    }
  }, [jumpToVirtualIndex, loopSize]);

  const goToIndex = useCallback((nextIndex: number) => {
    if (loopSize === 0) {
      setActiveVirtualIndex(0);
      return;
    }
    const normalized = ((nextIndex % loopSize) + loopSize) % loopSize;
    const nextVirtual = loopSize + normalized;
    setActiveVirtualIndex(nextVirtual);
    jumpToVirtualIndex(nextVirtual, "smooth");
  }, [jumpToVirtualIndex, loopSize]);

  const scrollToActive = useCallback(() => {
    if (loopSize === 0) return;
    jumpToVirtualIndex(renderedVirtualIndex, "smooth");
  }, [jumpToVirtualIndex, loopSize, renderedVirtualIndex]);

  const move = useCallback((direction: "prev" | "next") => {
    if (loopSize <= 1) return;
    const nextVirtual = renderedVirtualIndex + (direction === "next" ? 1 : -1);
    setActiveVirtualIndex(nextVirtual);
    scheduleLoopReset(nextVirtual);
  }, [loopSize, renderedVirtualIndex, scheduleLoopReset]);

  const getItemState = useCallback((index: number): "active" | "near" | "far" => {
    if (loopSize <= 1) return "active";
    const distance = Math.abs(index - renderedVirtualIndex);
    if (distance === 0) return "active";
    if (distance === 1) return "near";
    return "far";
  }, [loopSize, renderedVirtualIndex]);

  useEffect(() => {
    scrollToActive();
  }, [scrollToActive]);

  useEffect(() => () => {
    if (loopResetTimerRef.current != null) {
      window.clearTimeout(loopResetTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (loopSize <= 1 || paused || loading) return;
    const timer = window.setInterval(() => {
      move("next");
    }, DAILY_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loading, loopSize, move, paused]);

  return (
    <Stack gap="sm">
      <div className="da-section-title-wrap">
        <div className="da-section-title">{title}</div>
      </div>

      {loading ? (
        <Card className="glass-card" withBorder>
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        </Card>
      ) : sectionItems.length === 0 ? (
        <Card className="glass-card" withBorder>
          <Text c="dimmed">{emptyText}</Text>
        </Card>
      ) : (
        <div className="home-daily-carousel-shell" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div ref={trackRef} className="home-daily-carousel-track">
            {loopedItems.map((item, index) => (
              <div
                key={`${item.id}:${index}`}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="home-daily-carousel-item"
                data-state={getItemState(index)}
                onClick={() => goToIndex(index)}
              >
                <MediaWallCard item={item} t={t} titleLanguage={titleLanguage} sourceHref={sourceHref} />
              </div>
            ))}
          </div>

          {sectionItems.length > 1 ? (
            <>
              <ActionIcon
                className="app-icon-btn home-daily-carousel-control home-daily-carousel-control-prev"
                variant="filled"
                color="slate"
                aria-label="Previous slide"
                onClick={() => move("prev")}
              >
                <ChevronLeft size={16} />
              </ActionIcon>
              <ActionIcon
                className="app-icon-btn home-daily-carousel-control home-daily-carousel-control-next"
                variant="filled"
                color="slate"
                aria-label="Next slide"
                onClick={() => move("next")}
              >
                <ChevronRight size={16} />
              </ActionIcon>
            </>
          ) : null}
        </div>
      )}
    </Stack>
  );
}

export function HomePage() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const titleLanguage = locale === "en" ? "en" : "zh";
  const currentPageHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const homeLayoutRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(HOME_SECTION_TARGET_COUNT);
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(DEFAULT_HOME_SETTINGS);
  const [activeDayToken, setActiveDayToken] = useState<number>(buildRecommendationDayToken(DEFAULT_HOME_SETTINGS.daily.refreshHour));
  const [dailyPicksPool, setDailyPicksPool] = useState<MediaListItem[]>([]);
  const [highScorePool, setHighScorePool] = useState<MediaListItem[]>([]);
  const [movies, setMovies] = useState<MediaListItem[]>([]);
  const [series, setSeries] = useState<MediaListItem[]>([]);
  const [anime, setAnime] = useState<MediaListItem[]>([]);

  const loadSection = useCallback(async (category: "movie" | "series" | "anime", heatDays: number) => {
    const data = await fetchMediaList({ category, sort: "popular", heatDays, limit: HOME_SECTION_POOL_LIMIT, page: 1 });
    return data.items || [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const latestHomeSettings = await fetchHomeSettings();
      const dayToken = buildRecommendationDayToken(latestHomeSettings.daily.refreshHour);
      const hotDays = latestHomeSettings.hot.days;
      const [popularData, highScoreItems, movieItems, seriesItems, animeItems] = await Promise.all([
        fetchMediaList({ sort: "popular", heatDays: hotDays, limit: latestHomeSettings.daily.poolLimit, page: 1 }),
        fetchHighScorePool(latestHomeSettings.highScore, HOME_SECTION_POOL_LIMIT),
        loadSection("movie", hotDays),
        loadSection("series", hotDays),
        loadSection("anime", hotDays)
      ]);

      setHomeSettings(latestHomeSettings);
      setActiveDayToken(dayToken);
      setDailyPicksPool(popularData.items || []);
      setHighScorePool(highScoreItems);
      setMovies(movieItems);
      setSeries(seriesItems);
      setAnime(animeItems);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [loadSection]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextToken = buildRecommendationDayToken(homeSettings.daily.refreshHour);
      if (nextToken !== activeDayToken) {
        void load();
      }
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [activeDayToken, homeSettings.daily.refreshHour, load]);

  useEffect(() => {
    const element = homeLayoutRef.current;
    if (!element) return;

    let frameId: number | null = null;
    const updateLimit = () => {
      const next = resolveAdaptiveSectionCount(element.clientWidth, HOME_SECTION_TARGET_COUNT);
      setDisplayLimit((current) => (current === next ? current : next));
    };
    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateLimit();
      });
    };

    updateLimit();

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
  }, []);

  const dailyPicks = useMemo(
    () => pickDailyRecommendations(dailyPicksPool, displayLimit, activeDayToken),
    [activeDayToken, dailyPicksPool, displayLimit]
  );
  const highScore = useMemo(
    () => pickHighScoreRecommendations(highScorePool, displayLimit, activeDayToken),
    [activeDayToken, displayLimit, highScorePool]
  );

  return (
    <div ref={homeLayoutRef}>
      <Stack gap="md">
      {/* <Card className="glass-card da-search-card" withBorder>
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={4} className="page-heading">
            <Title order={2} className="page-title">{t("home.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("home.subtitle")}</Text>
            <Group gap="xs" className="card-meta-row">
              <Badge variant="light" color="orange">{t("contentTypes.movie")}</Badge>
              <Badge variant="light" color="orange">{t("contentTypes.tv_show")}</Badge>
              <Badge variant="light" color="orange">{t("nav.anime")}</Badge>
            </Group>
          </Stack>
          <Group>
            <Button renderRoot={(props) => <Link href="/media/movie" {...props} />} leftSection={<Clapperboard size={14} />}>
              {t("home.gotoMedia")}
            </Button>
            <Button renderRoot={(props) => <Link href="/torrents" {...props} />} variant="default" leftSection={<ListOrdered size={14} />}>
              {t("home.gotoTorrents")}
            </Button>
            <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void load()}>
              {t("common.refresh")}
            </Button>
          </Group>
        </Group>
      </Card> */}

      <DailyPicksCarousel
        title={t("home.dailyPicks")}
        items={dailyPicks}
        displayLimit={displayLimit}
        loading={loading}
        emptyText={t("media.noResults")}
        t={t}
        titleLanguage={titleLanguage}
        sourceHref={currentPageHref}
      />
      <HomeSection title={t("home.highRated")} items={highScore} displayLimit={displayLimit} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} sourceHref={currentPageHref} />
      <HomeSection title={t("home.hotMovies")} items={movies} displayLimit={displayLimit} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} sourceHref={currentPageHref} />
      <HomeSection title={t("home.hotSeries")} items={series} displayLimit={displayLimit} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} sourceHref={currentPageHref} />
      <HomeSection title={t("home.hotAnime")} items={anime} displayLimit={displayLimit} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} sourceHref={currentPageHref} />
      </Stack>
    </div>
  );
}

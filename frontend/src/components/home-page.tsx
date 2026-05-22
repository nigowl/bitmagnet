"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/languages/provider";
import { fetchMediaList, type MediaListItem } from "@/lib/media-api";
import { DailyPicksCarousel, HomeLoadingSkeleton, HomeSection } from "./home-page.sections";

const HOME_SECTION_TARGET_COUNT = 20;
const HOME_SECTION_POOL_LIMIT = 48;
const HOME_SECTION_MIN_CARD_WIDTH = 188;
const HOME_SECTION_GRID_GAP = 16;
const HIGH_SCORE_FETCH_MAX_PAGES = 8;

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

  if (loading) {
    return <div ref={homeLayoutRef}><HomeLoadingSkeleton /></div>;
  }

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

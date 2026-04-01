"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, Image, Loader, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Clapperboard, ListOrdered, RefreshCw, Users } from "lucide-react";
import { useI18n } from "@/languages/provider";
import { fetchMediaList, type MediaListItem } from "@/lib/media-api";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getPosterUrl, pickBestQualityTag } from "@/lib/media";

function pickDailyRecommendations(items: MediaListItem[], count: number): MediaListItem[] {
  if (items.length <= count) return items;
  const dayToken = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const start = dayToken % items.length;
  const rotated = [...items.slice(start), ...items.slice(0, start)];
  return rotated.slice(0, count);
}

function HomeSection({ title, items, loading, emptyText, t, titleLanguage }: {
  title: string;
  items: MediaListItem[];
  loading: boolean;
  emptyText: string;
  t: (key: string) => string;
  titleLanguage: "zh" | "en";
}) {
  const sectionItems = items.slice(0, 12);

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
        <div className="home-media-grid">
          {sectionItems.map((item) => {
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
              <div key={item.id} className="home-media-item">
                <Link href={buildMediaDetailHref(item)} className="unstyled-link">
                  <article className="media-wall-card home-media-card">
                    <div className="media-wall-poster-shell">
                      {poster ? (
                        <Image className="media-wall-poster home-media-poster" src={poster} alt={titleText} />
                      ) : (
                        <div className="media-wall-poster home-media-poster media-wall-poster-fallback">
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
          })}
        </div>
      )}
    </Stack>
  );
}

export function HomePage() {
  const { t, locale } = useI18n();
  const titleLanguage = locale === "en" ? "en" : "zh";
  const [loading, setLoading] = useState(true);
  const [dailyPicks, setDailyPicks] = useState<MediaListItem[]>([]);
  const [highScore, setHighScore] = useState<MediaListItem[]>([]);
  const [hotPicks, setHotPicks] = useState<MediaListItem[]>([]);
  const [movies, setMovies] = useState<MediaListItem[]>([]);
  const [series, setSeries] = useState<MediaListItem[]>([]);
  const [anime, setAnime] = useState<MediaListItem[]>([]);

  const loadSection = useCallback(async (category: "movie" | "series" | "anime", limit: number) => {
    const data = await fetchMediaList({ category, limit, page: 1 });
    return data.items || [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [popularData, ratingData, downloadData, movieItems, seriesItems, animeItems] = await Promise.all([
        fetchMediaList({ sort: "popular", limit: 36, page: 1 }),
        fetchMediaList({ sort: "rating", limit: 12, page: 1 }),
        fetchMediaList({ sort: "download", limit: 12, page: 1 }),
        loadSection("movie", 12),
        loadSection("series", 12),
        loadSection("anime", 12)
      ]);

      const popularItems = popularData.items || [];
      setDailyPicks(pickDailyRecommendations(popularItems, 12));
      setHighScore((ratingData.items || []).slice(0, 12));
      setHotPicks((downloadData.items || []).length > 0 ? (downloadData.items || []).slice(0, 12) : popularItems.slice(0, 12));
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

  return (
    <Stack gap="md">
      <Card className="glass-card da-search-card" withBorder>
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
      </Card>

      <HomeSection title={t("home.dailyPicks")} items={dailyPicks} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
      <HomeSection title={t("home.highRated")} items={highScore} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
      <HomeSection title={t("home.hotNow")} items={hotPicks} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
      <HomeSection title={t("contentTypes.movie")} items={movies} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
      <HomeSection title={t("contentTypes.tv_show")} items={series} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
      <HomeSection title={t("nav.anime")} items={anime} loading={loading} emptyText={t("media.noResults")} t={t} titleLanguage={titleLanguage} />
    </Stack>
  );
}

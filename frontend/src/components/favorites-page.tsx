"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { HardDrive, HeartOff, LogIn, RefreshCw, UserPlus, Users } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { CoverImage } from "@/components/cover-image";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { fetchMediaDetail, type MediaDetailResponse } from "@/lib/media-api";
import {
  buildMediaDetailHref,
  buildMediaEntryIdFromContentRef,
  getDisplayTitle,
  getPosterUrl,
  isAnimeItem,
  pickBestQualityTag,
  type MediaLikeItem
} from "@/lib/media";
import { useTabsUnderline } from "@/lib/use-tabs-underline";
import { useI18n } from "@/languages/provider";

type FavoriteItem = {
  infoHash: string;
  title: string;
  contentType?: string | null;
  contentSource?: string | null;
  contentId?: string | null;
  torrent: {
    size: number;
  };
  content?: {
    id?: string | null;
    type?: string | null;
    source?: string | null;
    title?: string | null;
    releaseYear?: number | null;
    attributes?: Array<{
      source: string;
      key: string;
      value: string;
    }> | null;
    collections?: Array<{
      type: string;
      name: string;
    }> | null;
  } | null;
  languages?: Array<{
    id?: string | null;
    name?: string | null;
  }> | null;
  seeders?: number | null;
  videoResolution?: string | null;
  videoSource?: string | null;
};

type FavoriteSearchResponse = {
  torrentContent: {
    search: {
      items: FavoriteItem[];
    };
  };
};

type FavoriteCategory = "movie" | "series" | "anime";

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

function classifyFavorite(item: FavoriteItem): FavoriteCategory {
  if (isAnimeItem(item as MediaLikeItem)) {
    return "anime";
  }
  const type = (item.contentType || "").toLowerCase();
  if (type === "movie") {
    return "movie";
  }
  if (type === "tv_show" || type === "series") {
    return "series";
  }
  return "movie";
}

function getFavoriteMediaHref(item: FavoriteItem): string | null {
  const resolvedType = item.content?.type ?? item.contentType;
  const resolvedSource = item.content?.source ?? item.contentSource;
  const resolvedContentId = item.content?.id ?? item.contentId;
  const mediaId = buildMediaEntryIdFromContentRef(resolvedType, resolvedSource, resolvedContentId);
  if (!mediaId) {
    return null;
  }

  return buildMediaDetailHref({
    id: mediaId,
    contentType: resolvedType ?? null,
    title: item.content?.title ?? item.title,
    content: item.content
      ? {
          title: item.content.title ?? null,
          collections: item.content.collections ?? null
        }
      : null
  });
}

export function FavoritesPage() {
  const { t, locale } = useI18n();
  const { user, loading, favorites, refreshFavorites, toggleFavorite } = useAuth();
  const { openLogin, openRegister } = useAuthDialog();
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [favoriteMediaDetails, setFavoriteMediaDetails] = useState<Record<string, MediaDetailResponse["item"]>>({});
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState<FavoriteCategory>("movie");
  const titleLanguage = locale === "en" ? "en" : "zh";
  const tabsRef = useTabsUnderline();

  useEffect(() => {
    let active = true;

    const loadFavorites = async () => {
      if (!user || favorites.length === 0) {
        if (active) {
          setFavoriteItems([]);
          setFavoriteMediaDetails({});
        }
        return;
      }

      setLoadingFavorites(true);
      try {
        const data = await graphqlRequest<FavoriteSearchResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
          input: {
            infoHashes: favorites,
            limit: Math.max(favorites.length, 1),
            page: 1,
            orderBy: [{ field: "updated_at", descending: true }]
          }
        });

        const items = data.torrentContent.search.items || [];
        const order = new Map(favorites.map((hash, index) => [hash, index]));
        items.sort((a, b) => (order.get(a.infoHash) ?? 0) - (order.get(b.infoHash) ?? 0));

        const mediaIDs = Array.from(new Set(
          items
            .map((item) => buildMediaEntryIdFromContentRef(
              item.content?.type ?? item.contentType,
              item.content?.source ?? item.contentSource,
              item.content?.id ?? item.contentId
            ))
            .filter((value): value is string => Boolean(value))
        ));

        const detailMap: Record<string, MediaDetailResponse["item"]> = {};
        if (mediaIDs.length > 0) {
          const detailResults = await Promise.allSettled(
            mediaIDs.map(async (mediaID) => {
              const detail = await fetchMediaDetail(mediaID);
              return { mediaID, item: detail.item };
            })
          );
          for (const result of detailResults) {
            if (result.status === "fulfilled" && result.value.item) {
              detailMap[result.value.mediaID] = result.value.item;
            }
          }
        }

        if (!active) {
          return;
        }
        setFavoriteItems(items);
        setFavoriteMediaDetails(detailMap);
      } catch (error) {
        if (active) {
          notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        if (active) {
          setLoadingFavorites(false);
        }
      }
    };

    void loadFavorites();

    return () => {
      active = false;
    };
  }, [favorites, user]);

  const groupedItems = useMemo(() => {
    const groups: Record<FavoriteCategory, FavoriteItem[]> = { movie: [], series: [], anime: [] };
    for (const item of favoriteItems) {
      groups[classifyFavorite(item)].push(item);
    }
    return groups;
  }, [favoriteItems]);

  const currentItems = groupedItems[activeTab];

  if (loading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="glass-card" withBorder maw={560} mx="auto">
        <Stack>
          <Title order={2}>{t("profile.needLogin")}</Title>
          <Text c="dimmed">{t("profile.needLoginDesc")}</Text>
          <Group>
            <Button leftSection={<LogIn size={15} />} onClick={openLogin}>
              {t("auth.login")}
            </Button>
            <Button variant="light" leftSection={<UserPlus size={15} />} onClick={openRegister}>
              {t("auth.register")}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card className="glass-card" withBorder>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>{t("favorites.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("favorites.subtitle")}</Text>
          </Stack>
          <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void refreshFavorites()}>
            {t("common.refresh")}
          </Button>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs ref={tabsRef} className="app-tabs" value={activeTab} onChange={(value) => setActiveTab((value as FavoriteCategory) || "movie")}>
          <Tabs.List grow>
            <Tabs.Tab value="movie">
              {t("favorites.tabs.movie")} ({groupedItems.movie.length})
            </Tabs.Tab>
            <Tabs.Tab value="series">
              {t("favorites.tabs.series")} ({groupedItems.series.length})
            </Tabs.Tab>
            <Tabs.Tab value="anime">
              {t("favorites.tabs.anime")} ({groupedItems.anime.length})
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={activeTab} pt="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>{t("profile.favorites")}</Text>
                <Badge variant="light">{currentItems.length}</Badge>
              </Group>
              <Button variant="default" size="xs" leftSection={<RefreshCw size={13} />} onClick={() => void refreshFavorites()}>
                {t("common.refresh")}
              </Button>
            </Group>

            {loadingFavorites ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : currentItems.length === 0 ? (
              <Text c="dimmed">{t("favorites.empty")}</Text>
            ) : (
              <div className="favorites-media-grid">
                {currentItems.map((item) => {
                  const resolvedType = item.content?.type ?? item.contentType;
                  const resolvedSource = item.content?.source ?? item.contentSource;
                  const resolvedContentId = item.content?.id ?? item.contentId;
                  const mediaId = buildMediaEntryIdFromContentRef(resolvedType, resolvedSource, resolvedContentId);
                  const detailItem = mediaId ? favoriteMediaDetails[mediaId] : undefined;
                  const href = getFavoriteMediaHref(item) || `/torrents/${item.infoHash}`;
                  const mediaLike: MediaLikeItem = {
                    id: mediaId ?? undefined,
                    title: detailItem?.title ?? item.content?.title ?? item.title,
                    nameOriginal: detailItem?.nameOriginal,
                    nameEn: detailItem?.nameEn,
                    nameZh: detailItem?.nameZh,
                    posterPath: detailItem?.posterPath,
                    qualityTags: detailItem?.qualityTags ?? undefined,
                    isAnime: detailItem?.isAnime,
                    content: {
                      title: detailItem?.title ?? item.content?.title ?? item.title,
                      collections: detailItem?.collections ?? item.content?.collections ?? [],
                      attributes: detailItem?.attributes ?? item.content?.attributes ?? []
                    }
                  };
                  const poster = getPosterUrl(mediaLike, "md");
                  const titleText = getDisplayTitle(mediaLike, titleLanguage);
                  const categoryLabel = (detailItem?.isAnime || classifyFavorite(item) === "anime")
                    ? t("nav.anime")
                    : (detailItem?.contentType || resolvedType)
                      ? t(`contentTypes.${detailItem?.contentType || resolvedType}`)
                      : "-";
                  const qualityTags = (detailItem?.qualityTags && detailItem.qualityTags.length > 0)
                    ? detailItem.qualityTags
                    : [item.videoResolution, item.videoSource].map((value) => value?.trim() ?? "").filter(Boolean);
                  const primaryQuality = pickBestQualityTag(qualityTags);
                  const languageText = (detailItem?.languages && detailItem.languages.length > 0
                    ? detailItem.languages
                    : (item.languages ?? []))
                    .map((lang) => lang.name?.trim() ?? "")
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(" / ");
                  const facts = [detailItem?.releaseYear ? String(detailItem.releaseYear) : (item.content?.releaseYear ? String(item.content.releaseYear) : ""), languageText]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <div key={item.infoHash} className="favorites-media-item">
                      <article className="media-wall-card home-media-card favorites-media-card">
                        <Link href={href} className="unstyled-link favorites-media-link">
                          <div className="media-wall-poster-shell">
                            {poster ? (
                              <CoverImage className="media-wall-poster home-media-poster" src={poster} alt={titleText} />
                            ) : (
                              <div className="media-wall-poster home-media-poster media-wall-poster-fallback">
                                <Text c="dimmed" size="sm">{t("media.noPoster")}</Text>
                              </div>
                            )}

                            <div className="media-wall-overlay media-wall-overlay-top">
                              <div className="media-wall-overlay-group">
                                <span className="media-poster-chip media-poster-chip-type">{categoryLabel}</span>
                              </div>
                              {primaryQuality ? <span className="media-poster-chip media-poster-chip-highlight">{primaryQuality}</span> : null}
                            </div>

                            <div className="media-wall-overlay media-wall-overlay-bottom">
                              <div className="media-wall-overlay-group">
                                <span className="media-poster-chip">
                                  <HardDrive size={12} />
                                  {formatBytes(item.torrent.size)}
                                </span>
                                {item.seeders != null ? (
                                  <span className="media-poster-chip">
                                    <Users size={12} />
                                    {item.seeders}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="media-wall-content">
                            <div className="media-wall-title">{titleText}</div>
                            {facts ? <div className="media-wall-facts">{facts}</div> : null}
                          </div>
                        </Link>

                        <div className="favorites-media-actions">
                          <Button
                            className="favorites-media-remove"
                            size="xs"
                            variant="subtle"
                            color="red"
                            leftSection={<HeartOff size={14} />}
                            onClick={() => {
                              void toggleFavorite(item.infoHash).then(() => {
                                notifications.show({ color: "green", message: t("profile.favoriteRemoved") });
                              }).catch((error: unknown) => {
                                notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
                              });
                            }}
                          >
                            {t("profile.removeFavorite")}
                          </Button>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
}

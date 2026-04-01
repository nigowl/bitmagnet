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
  Table,
  Tabs,
  Text,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { HeartOff, LogIn, RefreshCw, UserPlus } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { buildMediaDetailHref, buildMediaEntryIdFromContentRef, isAnimeItem, type MediaLikeItem } from "@/lib/media";
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
    collections?: Array<{
      type: string;
      name: string;
    }> | null;
  } | null;
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
  const { t } = useI18n();
  const { user, loading, favorites, refreshFavorites, toggleFavorite } = useAuth();
  const { openLogin, openRegister } = useAuthDialog();
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState<FavoriteCategory>("movie");

  useEffect(() => {
    const loadFavorites = async () => {
      if (!user || favorites.length === 0) {
        setFavoriteItems([]);
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
        setFavoriteItems(items);
      } catch (error) {
        notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoadingFavorites(false);
      }
    };

    void loadFavorites();
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
            <Text c="dimmed">{t("favorites.subtitle")}</Text>
          </Stack>
          <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void refreshFavorites()}>
            {t("common.refresh")}
          </Button>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs value={activeTab} onChange={(value) => setActiveTab((value as FavoriteCategory) || "movie")}>
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
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("torrents.table.title")}</Table.Th>
                    <Table.Th>{t("torrents.table.type")}</Table.Th>
                    <Table.Th>{t("torrents.table.size")}</Table.Th>
                    <Table.Th>{t("torrents.table.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {currentItems.map((item) => (
                    <Table.Tr key={item.infoHash}>
                      <Table.Td>
                        <Link href={getFavoriteMediaHref(item) || `/torrents/${item.infoHash}`} className="unstyled-link">
                          <Text lineClamp={1}>{item.content?.title?.trim() || item.title}</Text>
                        </Link>
                      </Table.Td>
                      <Table.Td>
                        {classifyFavorite(item) === "anime"
                          ? t("nav.anime")
                          : item.contentType
                            ? t(`contentTypes.${item.contentType}`)
                            : "-"}
                      </Table.Td>
                      <Table.Td>{formatBytes(item.torrent.size)}</Table.Td>
                      <Table.Td>
                        <Button
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
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
}

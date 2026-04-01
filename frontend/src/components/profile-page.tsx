"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Table,
  Text,
  Tabs,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { HeartOff, LogIn, RefreshCw, UserPlus } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { useI18n } from "@/languages/provider";

type FavoriteItem = {
  infoHash: string;
  title: string;
  contentType?: string | null;
  torrent: {
    size: number;
  };
};

type FavoriteSearchResponse = {
  torrentContent: {
    search: {
      items: FavoriteItem[];
    };
  };
};

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

export function ProfilePage() {
  const { t } = useI18n();
  const { user, loading, favorites, refreshFavorites, toggleFavorite, changePassword } = useAuth();
  const { openLogin, openRegister } = useAuthDialog();
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

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

  const createdAt = useMemo(() => {
    if (!user) return "-";
    return new Date(user.createdAt).toLocaleString();
  }, [user]);

  const submitPassword = async () => {
    if (newPassword !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notifications.show({ color: "green", message: t("profile.passwordChanged") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingPassword(false);
    }
  };

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
            <Title order={2}>{t("profile.title")}</Title>
            <Text c="dimmed">{t("profile.subtitle")}</Text>
          </Stack>
          <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void refreshFavorites()}>
            {t("common.refresh")}
          </Button>
        </Group>

        <Group mt="md" gap="xs">
          <Badge variant="light">{user.username}</Badge>
          <Badge variant="light" color={user.role === "admin" ? "orange" : "blue"}>
            {user.role === "admin" ? t("profile.admin") : t("profile.user")}
          </Badge>
          <Badge variant="outline">{t("profile.joinedAt")}: {createdAt}</Badge>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        <Tabs defaultValue="favorites">
          <Tabs.List grow>
            <Tabs.Tab value="favorites">{t("profile.tabFavorites")}</Tabs.Tab>
            <Tabs.Tab value="security">{t("profile.tabSecurity")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="favorites" pt="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>{t("profile.favorites")}</Text>
                <Badge variant="light">{favorites.length}</Badge>
              </Group>
              <Button variant="default" size="xs" leftSection={<RefreshCw size={13} />} onClick={() => void refreshFavorites()}>
                {t("common.refresh")}
              </Button>
            </Group>

            {loadingFavorites ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : favoriteItems.length === 0 ? (
              <Text c="dimmed">{t("profile.noFavorites")}</Text>
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
                  {favoriteItems.map((item) => (
                    <Table.Tr key={item.infoHash}>
                      <Table.Td>
                        <Link href={`/torrents/${item.infoHash}`} className="unstyled-link">
                          <Text lineClamp={1}>{item.title}</Text>
                        </Link>
                      </Table.Td>
                      <Table.Td>{item.contentType ? t(`contentTypes.${item.contentType}`) : "-"}</Table.Td>
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

          <Tabs.Panel value="security" pt="md">
            <Stack maw={560}>
              <Text fw={600}>{t("profile.changePassword")}</Text>
              <PasswordInput label={t("profile.oldPassword")} value={oldPassword} onChange={(event) => setOldPassword(event.currentTarget.value)} />
              <PasswordInput label={t("profile.newPassword")} value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
              <PasswordInput label={t("profile.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
              <Button loading={savingPassword} onClick={() => void submitPassword()}>
                {t("profile.savePassword")}
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ArrowLeft, ExternalLink, Heart, HeartOff, RefreshCw } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY, TORRENT_FILES_QUERY } from "@/lib/graphql";
import { useI18n } from "@/languages/provider";

type DetailResponse = {
  torrentContent: {
    search: {
      items: Array<{
        infoHash: string;
        title: string;
        contentType?: string | null;
        seeders?: number | null;
        leechers?: number | null;
        publishedAt?: string | null;
        torrent: {
          name: string;
          size: number;
          filesCount?: number | null;
          singleFile?: boolean | null;
          fileType?: string | null;
          magnetUri?: string | null;
          tagNames: string[];
          sources: Array<{ key: string; name: string }>;
        };
        content?: {
          title?: string | null;
          overview?: string | null;
          releaseYear?: number | null;
          collections?: Array<{ type: string; name: string }> | null;
          attributes?: Array<{ source: string; key: string; value: string }> | null;
        } | null;
      }>;
    };
  };
};

type FilesResponse = {
  torrent: {
    files: {
      items: Array<{
        index: number;
        path: string;
        size: number;
        fileType?: string | null;
      }>;
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

export function TorrentDetailPage({ infoHash }: { infoHash: string }) {
  const { t } = useI18n();
  const { openLogin } = useAuthDialog();
  const { user, hasFavorite, toggleFavorite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<DetailResponse["torrentContent"]["search"]["items"][number] | null>(null);
  const [files, setFiles] = useState<FilesResponse["torrent"]["files"]["items"]>([]);

  const renderContentType = useCallback(
    (type?: string | null) => {
      if (!type) return "-";
      const key = `contentTypes.${type}`;
      const translated = t(key);
      return translated === key ? type : translated;
    },
    [t]
  );

  const typeSpecificRows = useMemo(() => {
    if (!item) return [];

    const attributes = item.content?.attributes || [];
    const findAttribute = (keys: string[]) => {
      const lower = keys.map((key) => key.toLowerCase());
      const matched = attributes.find((attr) => lower.includes(attr.key.toLowerCase()));
      return matched?.value;
    };

    if (item.contentType === "movie" || item.contentType === "tv_show") {
      const genres =
        item.content?.collections
          ?.filter((collection) => collection.type === "genre")
          .map((collection) => collection.name)
          .join(", ") || undefined;
      return [
        { label: t("torrents.fields.releaseYear"), value: item.content?.releaseYear ? String(item.content.releaseYear) : undefined },
        { label: t("torrents.fields.genre"), value: genres }
      ].filter((row) => !!row.value);
    }

    if (item.contentType === "music") {
      return [
        { label: t("torrents.fields.artist"), value: findAttribute(["artist", "album_artist"]) },
        { label: t("torrents.fields.album"), value: findAttribute(["album"]) },
        { label: t("torrents.fields.releaseYear"), value: item.content?.releaseYear ? String(item.content.releaseYear) : undefined }
      ].filter((row) => !!row.value);
    }

    if (["ebook", "comic", "audiobook"].includes(item.contentType || "")) {
      return [
        { label: t("torrents.fields.author"), value: findAttribute(["author", "writer"]) },
        { label: t("torrents.fields.publisher"), value: findAttribute(["publisher"]) },
        { label: t("torrents.fields.language"), value: findAttribute(["language"]) }
      ].filter((row) => !!row.value);
    }

    if (["game", "software"].includes(item.contentType || "")) {
      return [
        { label: t("torrents.fields.platform"), value: findAttribute(["platform", "os", "system"]) },
        { label: t("torrents.fields.version"), value: findAttribute(["version", "build"]) }
      ].filter((row) => !!row.value);
    }

    return [
      { label: t("torrents.fields.category"), value: item.contentType || undefined },
      { label: t("torrents.fields.releaseYear"), value: item.content?.releaseYear ? String(item.content.releaseYear) : undefined }
    ].filter((row) => !!row.value);
  }, [item, t]);

  const displayFiles = useMemo(() => {
    if (!item) return files;
    if (files.length > 0) return files;
    if (!item.torrent.singleFile) return [];
    return [
      {
        index: 0,
        path: item.torrent.name,
        size: item.torrent.size,
        fileType: item.torrent.fileType || null
      }
    ];
  }, [files, item]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailData, filesData] = await Promise.all([
        graphqlRequest<DetailResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
          input: {
            infoHashes: [infoHash],
            limit: 1,
            page: 1
          }
        }),
        graphqlRequest<FilesResponse>(TORRENT_FILES_QUERY, {
          input: {
            infoHashes: [infoHash],
            limit: 500,
            page: 1
          }
        })
      ]);

      setItem(detailData.torrentContent.search.items[0] || null);
      setFiles(filesData.torrent.files.items || []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [infoHash]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!item) {
    return (
      <Card className="glass-card" withBorder>
        <Stack>
          <Text c="dimmed">{t("torrents.notFound")}</Text>
          <Button renderRoot={(props) => <Link href="/torrents" {...props} />} leftSection={<ArrowLeft size={14} />} variant="light" w="fit-content">
            {t("torrents.backToList")}
          </Button>
        </Stack>
      </Card>
    );
  }

  const favoriteActive = hasFavorite(infoHash);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Button renderRoot={(props) => <Link href="/torrents" {...props} />} leftSection={<ArrowLeft size={14} />} variant="light">
          {t("torrents.backToList")}
        </Button>
        <Group>
          <Button
            leftSection={favoriteActive ? <HeartOff size={14} /> : <Heart size={14} />}
            variant={favoriteActive ? "light" : "default"}
            onClick={() => {
              if (!user) {
                openLogin();
                return;
              }
              void toggleFavorite(infoHash)
                .then(() => {
                  notifications.show({
                    color: "green",
                    message: favoriteActive ? t("profile.favoriteRemoved") : t("profile.favoriteAdded")
                  });
                })
                .catch((error: unknown) => {
                  notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
                });
            }}
          >
            {favoriteActive ? t("profile.removeFavorite") : t("profile.addFavorite")}
          </Button>
          <Button leftSection={<RefreshCw size={14} />} variant="default" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </Group>
      </Group>

      <Card className="glass-card" withBorder>
        <Stack gap="xs" className="entity-hero-stack">
          <Title order={2} className="entity-title">{item.content?.title || item.title || item.torrent.name}</Title>
          <Text c="dimmed" className="entity-subtitle">{item.content?.overview || item.torrent.name}</Text>
          <Group gap="xs" className="card-meta-row">
            <Badge variant="light">{renderContentType(item.contentType)}</Badge>
            <Badge variant="light">{t("torrents.table.seeders")}: {item.seeders ?? "-"}</Badge>
            <Badge variant="light">{t("torrents.table.leechers")}: {item.leechers ?? "-"}</Badge>
            <Badge variant="light">{formatBytes(item.torrent.size)}</Badge>
          </Group>
          <Text size="sm" ff="monospace" className="detail-code-line">
            {item.infoHash}
          </Text>
          <Group gap={6}>
            {(item.torrent.tagNames || []).map((tag) => (
              <Badge key={tag} size="xs" variant="outline">
                {tag}
              </Badge>
            ))}
          </Group>
          <Group gap={6}>
            {(item.torrent.sources || []).map((source) => (
              <Badge key={source.key} size="xs" color="blue" variant="light">
                {source.name}
              </Badge>
            ))}
          </Group>
          {!!item.torrent.magnetUri && (
            <Button
              leftSection={<ExternalLink size={14} />}
              variant="light"
              onClick={() => window.open(item.torrent.magnetUri || "", "_blank", "noopener,noreferrer")}
              w="fit-content"
            >
              {t("torrents.openMagnet")}
            </Button>
          )}
        </Stack>
      </Card>

      <Card className="glass-card" withBorder>
        <Text fw={600} mb="sm">
          {t("torrents.typeSpecific")}
        </Text>
        {(typeSpecificRows || []).length === 0 ? (
          <Text c="dimmed">{t("torrents.typeSpecificEmpty")}</Text>
        ) : (
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("torrents.field")}</Table.Th>
                <Table.Th>{t("torrents.value")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {typeSpecificRows.map((row) => (
                <Table.Tr key={row.label}>
                  <Table.Td>{row.label}</Table.Td>
                  <Table.Td>{row.value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card className="glass-card" withBorder>
        <Text fw={600} mb="sm">
          {t("torrents.files")}
        </Text>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>{t("torrents.table.path")}</Table.Th>
              <Table.Th>{t("torrents.table.type")}</Table.Th>
              <Table.Th>{t("torrents.table.size")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {displayFiles.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="md">
                    {t("torrents.noFiles")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              displayFiles.map((file) => (
                <Table.Tr key={`${file.index}:${file.path}`}>
                  <Table.Td>{file.index}</Table.Td>
                  <Table.Td>{file.path}</Table.Td>
                  <Table.Td>{file.fileType || "-"}</Table.Td>
                  <Table.Td>{formatBytes(file.size)}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

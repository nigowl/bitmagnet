"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Image,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useI18n } from "@/languages/provider";
import { fetchMediaDetail, type MediaDetailResponse, type MediaDetailTorrent } from "@/lib/media-api";
import { buildMediaExternalLinks, extractMediaFacts, formatQualityTag, getBackdropUrl, getPosterUrl, pickRecommendedTorrent } from "@/lib/media";

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

function displayResolution(value?: string): string {
  if (!value) return "-";
  return value.startsWith("V") ? value.slice(1) : value;
}

function rowValue(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function metadataValue(value?: string | number | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function metadataList(values?: string[] | null): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) return null;
  return normalized.join(" / ");
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function TorrentRow({ item, t }: { item: MediaDetailTorrent; t: (key: string) => string }) {
  const torrentTitle = item.title || item.torrent.name;
  const filesCount = item.filesCount ?? item.torrent.filesCount;

  return (
    <Table.Tr>
      <Table.Td>
        <Link href={`/torrents/${item.infoHash}`} className="unstyled-link">
          <Text lineClamp={1} title={torrentTitle}>{torrentTitle}</Text>
        </Link>
      </Table.Td>
      <Table.Td>{rowValue(item.seeders)}</Table.Td>
      <Table.Td>{rowValue(item.leechers)}</Table.Td>
      <Table.Td>{formatBytes(item.size)}</Table.Td>
      <Table.Td>{rowValue(filesCount)}</Table.Td>
      <Table.Td>{displayResolution(item.videoResolution)}</Table.Td>
      <Table.Td>{item.torrent.sources.map((source) => source.name).join(" / ") || "-"}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            renderRoot={(props) => <Link href={`/torrents/${item.infoHash}`} {...props} />}
          >
            {t("media.openTorrent")}
          </Button>
          <Button
            size="xs"
            variant="default"
            component="a"
            href={item.torrent.magnetUri}
            target="_blank"
            rel="noreferrer"
            leftSection={<ExternalLink size={13} />}
          >
            Magnet
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function MediaDetailPage({ mediaId }: { mediaId: string }) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<MediaDetailResponse | null>(null);
  const titleLanguage = locale === "en" ? "en" : "zh";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMediaDetail(mediaId);
      setPayload(data);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poster = useMemo(() => (payload?.item ? getPosterUrl(payload.item, "lg") : null), [payload?.item]);
  const backdrop = useMemo(() => (payload?.item ? getBackdropUrl(payload.item, "lg") : null), [payload?.item]);

  if (loading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!payload) {
    return (
      <Card className="glass-card" withBorder>
        <Stack>
          <Text c="dimmed">{t("media.detail.notFound")}</Text>
          <Button renderRoot={(props) => <Link href="/media" {...props} />} leftSection={<ArrowLeft size={14} />} variant="light" w="fit-content">
            {t("media.detail.backToList")}
          </Button>
        </Stack>
      </Card>
    );
  }

  const { item, torrents } = payload;
  const originalDisplayTitle = firstNonEmpty(item.nameOriginal, item.originalTitle, item.title) || item.title;
  const selectedLanguageTitle = titleLanguage === "zh"
    ? firstNonEmpty(item.nameZh, item.nameEn)
    : firstNonEmpty(item.nameEn, item.nameZh);
  const selectedDisplayTitle = selectedLanguageTitle || originalDisplayTitle;
  const showSelectedDisplayTitle = !sameText(selectedDisplayTitle, originalDisplayTitle);
  const selectedOverview = (titleLanguage === "zh"
    ? firstNonEmpty(item.overviewZh, item.overviewEn)
    : firstNonEmpty(item.overviewEn, item.overviewZh)) || firstNonEmpty(item.overviewOriginal, item.overview);
  const aliases = (item.titleAliases ?? [])
    .filter((alias) => alias.trim())
    .filter((alias) => !sameText(alias, originalDisplayTitle))
    .filter((alias) => !sameText(alias, selectedDisplayTitle))
    .filter((alias, index, arr) =>
      arr.findIndex((candidate) => candidate.trim().toLowerCase() === alias.trim().toLowerCase()) === index
    );

  const genreNames = (item.collections ?? []).filter((collection) => collection.type === "genre").map((collection) => collection.name);
  const qualityTags = (item.qualityTags ?? []).map((tag) => formatQualityTag(tag)).filter(Boolean);
  const languageNames = (item.languages ?? []).map((language) => language.name).filter(Boolean);
  const factGroups = extractMediaFacts({ collections: item.collections ?? [], attributes: item.attributes ?? [] });
  const heroFactGroups = factGroups.filter((group) => ["country", "network", "studio", "awards"].includes(group.key));
  const externalLinks = buildMediaExternalLinks({
    contentType: item.contentType,
    contentSource: item.contentSource,
    contentId: item.contentId,
    title: item.title,
    releaseYear: item.releaseYear,
    imdbId: item.imdbId,
    doubanId: item.doubanId,
    attributes: item.attributes ?? []
  });
  const quickExternalLinks = externalLinks;
  const externalGridStyle = {
    "--media-external-cols": String(Math.max(1, quickExternalLinks.length))
  } as CSSProperties;
  const recommendedTorrent = pickRecommendedTorrent(torrents);
  const coverBackdrop = poster ?? backdrop;
  const releaseInfo = uniqueValues([
    item.releaseYear ? String(item.releaseYear) : null,
    item.releaseDate,
    ...(item.premiereDates ?? [])
  ]);
  const languageInfo = uniqueValues([
    item.originalLanguage,
    ...(item.spokenLanguages ?? [])
  ]);

  const metaRows = [
    { label: t("media.detail.tagline"), value: metadataValue(item.tagline) },
    { label: t("media.detail.status"), value: metadataValue(item.statusText) },
    { label: t("media.detail.homepage"), value: metadataValue(item.homepageUrl) },
    { label: t("media.detail.releaseTimeline"), value: metadataList(releaseInfo) },
    { label: t("media.detail.season"), value: metadataValue(item.seasonCount) },
    { label: t("media.detail.episodeCount"), value: metadataValue(item.episodeCount) },
    { label: t("media.detail.runtime"), value: metadataValue(item.runtime) },
    { label: t("media.detail.languageSummary"), value: metadataList(languageInfo) },
    { label: t("media.detail.productionCountries"), value: metadataList(item.productionCountries) },
    { label: t("media.detail.network"), value: metadataList(item.networkNames) },
    { label: t("media.detail.studio"), value: metadataList(item.studioNames) },
    { label: t("media.detail.awards"), value: metadataList(item.awardNames) },
    { label: t("media.detail.creator"), value: metadataList(item.creatorNames) },
    { label: t("media.detail.certification"), value: metadataValue(item.certification) },
    { label: t("media.detail.cast"), value: metadataList(item.castMembers) },
    { label: t("media.detail.director"), value: metadataList(item.directorNames) },
    { label: t("media.detail.writer"), value: metadataList(item.writerNames) },
    { label: t("media.detail.imdb"), value: metadataValue(item.imdbId) },
    { label: t("media.detail.douban"), value: metadataValue(item.doubanId) },
    { label: t("media.detail.rating"), value: item.voteAverage ? item.voteAverage.toFixed(1) : null },
    { label: t("media.detail.votes"), value: metadataValue(item.voteCount) },
    { label: t("media.detail.contentSource"), value: metadataValue(item.contentSource) },
    { label: t("media.detail.contentId"), value: metadataValue(item.contentId) },
    { label: t("media.detail.originalTitle"), value: metadataValue(item.originalTitle) },
    { label: t("media.torrentCount"), value: metadataValue(item.torrentCount) }
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <div className="media-detail-page-wrap">
      {coverBackdrop ? <div className="media-global-backdrop" style={{ backgroundImage: `url(${coverBackdrop})` }} /> : null}
      {coverBackdrop ? <div className="media-global-backdrop-mask" /> : null}

      <Stack gap="md" className="media-detail-page-content">
        <Group justify="space-between" wrap="wrap">
          <Button renderRoot={(props) => <Link href="/media" {...props} />} leftSection={<ArrowLeft size={14} />} variant="light">
            {t("media.detail.backToList")}
          </Button>
          <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </Group>

        <Card className="glass-card media-detail-hero" withBorder>
          <Group align="flex-start" wrap="nowrap" gap="lg">
            {poster ? (
              <Image src={poster} alt={item.title} w={220} radius="md" />
            ) : (
              <Card withBorder w={220} h={320} className="media-poster-fallback-card">
                <Text c="dimmed">{t("media.noPoster")}</Text>
              </Card>
            )}

            <Stack gap="sm" className="entity-hero-stack media-flex-grow">
              <div className="media-title-language-row">
                <div className="media-title-language-copy">
                  <Title order={2} className="entity-title">{originalDisplayTitle}</Title>
                  {showSelectedDisplayTitle ? (
                    <Text c="dimmed" className="entity-subtitle media-secondary-title">
                      {selectedDisplayTitle}
                    </Text>
                  ) : null}
                </div>
              </div>

              {selectedOverview ? <Text c="dimmed" className="entity-subtitle">{selectedOverview}</Text> : null}
              {aliases.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {aliases.slice(0, 6).map((alias) => (
                    <Badge key={alias} variant="dot" color="gray">{alias}</Badge>
                  ))}
                </Group>
              ) : null}

              <Group gap={8} wrap="wrap" className="card-meta-row">
                <Badge variant="light">{t(`contentTypes.${item.contentType}`)}</Badge>
                {item.isAnime ? <Badge variant="light" color="orange">{t("nav.anime")}</Badge> : null}
                {item.releaseYear ? <Badge variant="light">{item.releaseYear}</Badge> : null}
                {item.voteAverage ? <Badge variant="light">★ {item.voteAverage.toFixed(1)}</Badge> : null}
                <Badge variant="outline">{t("media.torrentCount")}: {item.torrentCount}</Badge>
              </Group>

              {genreNames.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {genreNames.map((genre) => (
                    <Badge key={genre} variant="dot" color="gray">{genre}</Badge>
                  ))}
                </Group>
              ) : null}

              {qualityTags.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {qualityTags.map((tag) => (
                    <Badge key={tag} variant="light" color="orange">{tag}</Badge>
                  ))}
                </Group>
              ) : null}

              {languageNames.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {languageNames.map((language) => (
                    <Badge key={language} variant="outline">{language}</Badge>
                  ))}
                </Group>
              ) : null}

              {heroFactGroups.length > 0 ? (
                <div className="media-facts-inline">
                  {heroFactGroups.map((group) => (
                    <div key={group.key} className="media-facts-inline-group">
                      <Text size="sm" fw={700}>{t(`media.detail.${group.key}`)}</Text>
                      <Group gap={6} wrap="wrap">
                        {group.values.slice(0, 6).map((value) => (
                          <Badge key={`${group.key}:${value}`} variant="dot" color="gray">{value}</Badge>
                        ))}
                      </Group>
                    </div>
                  ))}
                </div>
              ) : null}
            </Stack>
          </Group>
        </Card>

        {(externalLinks.length > 0 || recommendedTorrent) ? (
          <div className="media-detail-sidecars">
            {quickExternalLinks.length > 0 ? (
              <Card className="media-detail-sidecar-card media-external-card" withBorder>
                <Text fw={600} mb="sm">{t("media.detail.externalLinks")}</Text>
                <div className="media-external-links-grid" style={externalGridStyle}>
                  {quickExternalLinks.map((link) => (
                    <div key={link.href} className="media-external-link-row">
                      {(() => {
                        const linkValue = link.value;

                        return (
                          <>
                            <div>
                              <Text size="sm" fw={700} className="card-title">
                                {link.key === "tmdb" || link.key === "imdb" || link.key === "tvdb" || link.key === "douban"
                                  ? t(`media.sources.${link.key}`)
                                  : link.key === "homepage"
                                    ? t("media.detail.homepage")
                                    : link.label}
                              </Text>
                              <Text
                                size="xs"
                                c="dimmed"
                                lineClamp={1}
                                title={linkValue}
                              >
                                {linkValue}
                              </Text>
                            </div>
                            <Button
                              component="a"
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              variant="light"
                              size="xs"
                              rightSection={<ExternalLink size={13} />}
                            >
                              {t("media.detail.openLink")}
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {recommendedTorrent ? (
              <Card className="media-detail-sidecar-card media-recommend-card" withBorder>
                <Group justify="space-between" align="flex-start" gap="md">
                  <div>
                    <Text fw={600} className="card-title">{t("media.detail.recommendedTorrent")}</Text>
                    <Text
                      size="sm"
                      c="dimmed"
                      mt={4}
                      lineClamp={2}
                      className="entity-subtitle"
                      title={recommendedTorrent.title || recommendedTorrent.torrent.name}
                    >
                      {recommendedTorrent.title || recommendedTorrent.torrent.name}
                    </Text>
                  </div>
                  <Badge variant="light" color="orange">
                    {t("media.detail.bestChoice")}
                  </Badge>
                </Group>

                <Group gap={6} wrap="wrap" mt="sm">
                  {recommendedTorrent.videoResolution ? (
                    <Badge variant="light" color="orange">{displayResolution(recommendedTorrent.videoResolution)}</Badge>
                  ) : null}
                  {recommendedTorrent.videoSource ? (
                    <Badge variant="light">{formatQualityTag(recommendedTorrent.videoSource)}</Badge>
                  ) : null}
                  {recommendedTorrent.seeders ? (
                    <Badge variant="outline">{t("torrents.table.seeders")}: {recommendedTorrent.seeders}</Badge>
                  ) : null}
                  <Badge variant="outline">{formatBytes(recommendedTorrent.size)}</Badge>
                  {recommendedTorrent.torrent.sources.slice(0, 2).map((source) => (
                    <Badge key={`${recommendedTorrent.infoHash}:${source.key}`} variant="dot" color="gray">
                      {source.name}
                    </Badge>
                  ))}
                </Group>

                <Group gap="xs" mt="md" wrap="wrap">
                  <Button
                    variant="light"
                    renderRoot={(props) => <Link href={`/torrents/${recommendedTorrent.infoHash}`} {...props} />}
                  >
                    {t("media.openTorrent")}
                  </Button>
                  <Button
                    variant="default"
                    component="a"
                    href={recommendedTorrent.torrent.magnetUri}
                    target="_blank"
                    rel="noreferrer"
                    leftSection={<ExternalLink size={13} />}
                  >
                    Magnet
                  </Button>
                </Group>
              </Card>
            ) : null}
          </div>
        ) : null}

        {factGroups.length > 0 ? (
          <Card className="glass-card media-facts-card" withBorder>
            <Text fw={600} mb="sm">{t("media.detail.highlights")}</Text>
            <div className="media-facts-grid">
              {factGroups.map((group) => (
                <div key={group.key} className="media-facts-item">
                  <Text size="sm" fw={700} className="media-facts-item-label">
                    {t(`media.detail.${group.key}`)}
                  </Text>
                  <Group gap={6} wrap="wrap">
                    {group.values.map((value) => (
                      <Badge key={`${group.key}:${value}`} variant="light" color="orange">
                        {value}
                      </Badge>
                    ))}
                  </Group>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {metaRows.length > 0 ? (
          <Card className="glass-card" withBorder>
            <Text fw={600} mb="sm">{t("media.detail.metadata")}</Text>
            <Table withTableBorder striped>
              <Table.Tbody>
                {metaRows.map((row) => (
                  <Table.Tr key={row.label}>
                    <Table.Td className="table-key-cell"><Text fw={500}>{row.label}</Text></Table.Td>
                    <Table.Td>{row.value}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null}

        <Card className="glass-card" withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>{t("media.detail.torrentInfo")}</Text>
            <Badge variant="light">{torrents.length}</Badge>
          </Group>

          {torrents.length === 0 ? (
            <Text c="dimmed">{t("media.noResults")}</Text>
          ) : (
            <ScrollArea>
              <Table striped withTableBorder highlightOnHover miw={1060}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("torrents.table.title")}</Table.Th>
                    <Table.Th>{t("torrents.table.seeders")}</Table.Th>
                    <Table.Th>{t("torrents.table.leechers")}</Table.Th>
                    <Table.Th>{t("torrents.table.size")}</Table.Th>
                    <Table.Th>{t("torrents.table.filesCount")}</Table.Th>
                    <Table.Th>{t("media.detail.resolution")}</Table.Th>
                    <Table.Th>{t("torrents.table.source")}</Table.Th>
                    <Table.Th>{t("torrents.table.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {torrents.map((torrent) => (
                    <TorrentRow key={torrent.infoHash} item={torrent} t={t} />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Card>

      </Stack>
    </div>
  );
}

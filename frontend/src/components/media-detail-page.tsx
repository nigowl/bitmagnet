"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ArrowLeft, ExternalLink, Eye, Heart, Play, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/provider";
import { CoverImage } from "@/components/cover-image";
import { useI18n } from "@/languages/provider";
import {
  clearPlayerTransmissionCache,
  fetchMediaDetail,
  fetchPlayerTransmissionBatchStatus,
  type MediaDetailResponse,
  type MediaDetailTorrent,
  type PlayerTransmissionTaskStatus
} from "@/lib/media-api";
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

function normalizeResolutionFilter(value?: string | null): string {
  return displayResolution(value || "").trim().toLowerCase();
}

function resolutionSortValue(value: string): number {
  const match = value.trim().toLowerCase().match(/(\d{3,4})p?/);
  if (!match) return -1;
  return Number(match[1]) || -1;
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

function compactInlineValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fallbackCategoryHref(mediaType?: string): string {
  if (mediaType === "anime") return "/media/anime";
  if (mediaType === "series") return "/media/series";
  return "/media/movie";
}

function resolveReturnHref(sourceHref: string | null, fallbackHref: string): string {
  const normalized = sourceHref?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallbackHref;
  }
  return normalized;
}

function applySubtitleTemplate(urlTemplate: string, title: string, releaseYear?: number): string | null {
  const template = urlTemplate.trim();
  if (!template) {
    return null;
  }

  const encodedTitle = encodeURIComponent(title);
  const resolved = template
    .replaceAll("{title}", encodedTitle)
    .replaceAll("{titleEncoded}", encodedTitle)
    .replaceAll("{titleRaw}", title)
    .replaceAll("{year}", releaseYear ? String(releaseYear) : "");

  try {
    const parsed = new URL(resolved);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolvePlayerActionState(
  status: PlayerTransmissionTaskStatus | undefined
): { color: string; variant: "default" | "light" } {
  if (!status?.exists) {
    return { color: "slate", variant: "default" };
  }
  const state = status.state.trim().toLowerCase();
  if (status.progress >= 0.999 || state === "seeding" || state === "seed_wait") {
    return { color: "green", variant: "light" };
  }
  if (
    status.progress > 0 ||
    state === "downloading" ||
    state === "download_wait" ||
    state === "checking" ||
    state === "check_wait"
  ) {
    return { color: "yellow", variant: "light" };
  }
  return { color: "slate", variant: "default" };
}

function isTransmissionTaskComplete(status?: PlayerTransmissionTaskStatus): boolean {
  if (!status?.exists) return false;
  const state = status.state.trim().toLowerCase();
  return status.progress >= 0.999 || state === "seeding" || state === "seed_wait";
}

function TorrentRow({
  item,
  t,
  playerStatus,
  playerEnabled
}: {
  item: MediaDetailTorrent;
  t: (key: string) => string;
  playerStatus?: PlayerTransmissionTaskStatus;
  playerEnabled: boolean;
}) {
  const torrentTitle = item.title || item.torrent.name;
  const filesCount = item.filesCount ?? item.torrent.filesCount;
  const playerStyle = resolvePlayerActionState(playerStatus);

  return (
    <Table.Tr>
      <Table.Td>
        <Link href={`/torrents/${item.infoHash}`} className="unstyled-link">
          <Text size="sm" lineClamp={1} title={torrentTitle}>{torrentTitle}</Text>
        </Link>
      </Table.Td>
      <Table.Td>{rowValue(item.seeders)}</Table.Td>
      <Table.Td>{rowValue(item.leechers)}</Table.Td>
      <Table.Td>{formatBytes(item.size)}</Table.Td>
      <Table.Td>{rowValue(filesCount)}</Table.Td>
      <Table.Td>{displayResolution(item.videoResolution)}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          {playerEnabled ? (
            <Tooltip label={t("media.openPlayer")}>
              <ActionIcon
                className="app-icon-btn"
                size="sm"
                variant={playerStyle.variant}
                color={playerStyle.color}
                aria-label={t("media.openPlayer")}
                title={t("media.openPlayer")}
                renderRoot={(props) => <Link href={`/player/${encodeURIComponent(item.infoHash)}`} {...props} />}
              >
                <Play size={14} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          <Tooltip label={t("media.openTorrent")}>
            <ActionIcon
              className="app-icon-btn"
              size="sm"
              variant="default"
              color="slate"
              aria-label={t("media.openTorrent")}
              title={t("media.openTorrent")}
              renderRoot={(props) => <Link href={`/torrents/${item.infoHash}`} {...props} />}
            >
              <Eye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("media.openMagnet")}>
            <ActionIcon
              className="app-icon-btn"
              size="sm"
              variant="default"
              color="slate"
              aria-label={t("media.openMagnet")}
              title={t("media.openMagnet")}
              component="a"
              href={item.torrent.magnetUri}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function MediaDetailPage({ mediaId, mediaType }: { mediaId: string; mediaType?: string }) {
  const { t, locale } = useI18n();
  const { user, hasFavorite, toggleFavorite } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<MediaDetailResponse | null>(null);
  const [playerStatusMap, setPlayerStatusMap] = useState<Record<string, PlayerTransmissionTaskStatus>>({});
  const [torrentPage, setTorrentPage] = useState(1);
  const [torrentResolutionFilter, setTorrentResolutionFilter] = useState("all");
  const [torrentCachedOnly, setTorrentCachedOnly] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const titleLanguage = locale === "en" ? "en" : "zh";

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await fetchMediaDetail(mediaId, { refresh: forceRefresh });
      setPayload(data);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refreshPlayerStatuses = useCallback(async (torrents: MediaDetailTorrent[]) => {
    if (!payload?.playerEnabled || torrents.length === 0) {
      setPlayerStatusMap({});
      return;
    }
    const infoHashes = torrents.map((item) => item.infoHash).filter(Boolean);
    const result = await fetchPlayerTransmissionBatchStatus(infoHashes);
    const nextMap: Record<string, PlayerTransmissionTaskStatus> = {};
    result.items.forEach((item) => {
      const key = item.infoHash.trim().toLowerCase();
      if (!key) return;
      nextMap[key] = item;
    });
    setPlayerStatusMap(nextMap);
  }, [payload?.playerEnabled]);

  useEffect(() => {
    const torrents = payload?.torrents ?? [];
    if (!payload?.playerEnabled) {
      setPlayerStatusMap({});
      return;
    }
    if (torrents.length === 0) {
      setPlayerStatusMap({});
      return;
    }
    let cancelled = false;
    const loadBatch = async () => {
      try {
        if (cancelled) return;
        await refreshPlayerStatuses(torrents);
      } catch {
        if (cancelled) return;
        setPlayerStatusMap({});
      }
    };
    void loadBatch();
    return () => {
      cancelled = true;
    };
  }, [payload?.playerEnabled, payload?.torrents, refreshPlayerStatuses]);

  useEffect(() => {
    setTorrentPage(1);
  }, [payload?.item.id]);

  useEffect(() => {
    setTorrentPage(1);
  }, [torrentCachedOnly, torrentResolutionFilter]);

  const poster = useMemo(() => (payload?.item ? getPosterUrl(payload.item, "lg") : null), [payload?.item]);
  const backdrop = useMemo(() => (payload?.item ? getBackdropUrl(payload.item, "lg") : null), [payload?.item]);
  const fallbackListHref = resolveReturnHref(searchParams.get("from"), fallbackCategoryHref(mediaType));

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
          <Button
            renderRoot={(props) => <Link href={fallbackListHref} {...props} />}
            leftSection={<ArrowLeft size={14} />}
            variant="light"
            w="fit-content"
          >
            {t("media.detail.backToList")}
          </Button>
        </Stack>
      </Card>
    );
  }

  const { item, torrents } = payload;
  const torrentPageSize = 10;
  const torrentResolutionOptions = uniqueValues(torrents.map((torrent) => displayResolution(torrent.videoResolution)).filter((value) => value !== "-"))
    .sort((left, right) => {
      const leftScore = resolutionSortValue(left);
      const rightScore = resolutionSortValue(right);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.localeCompare(right);
    });
  const filteredTorrents = torrents.filter((torrent) => {
    if (torrentResolutionFilter !== "all" && normalizeResolutionFilter(torrent.videoResolution) !== torrentResolutionFilter) {
      return false;
    }
    if (torrentCachedOnly && !isTransmissionTaskComplete(playerStatusMap[torrent.infoHash.trim().toLowerCase()])) {
      return false;
    }
    return true;
  });
  const cachedTaskInfoHashes = torrents
    .filter((torrent) => playerStatusMap[torrent.infoHash.trim().toLowerCase()]?.exists)
    .map((torrent) => torrent.infoHash);
  const torrentTotalPages = Math.max(1, Math.ceil(filteredTorrents.length / torrentPageSize));
  const normalizedTorrentPage = Math.max(1, Math.min(torrentPage, torrentTotalPages));
  const pagedTorrents = filteredTorrents.slice((normalizedTorrentPage - 1) * torrentPageSize, normalizedTorrentPage * torrentPageSize);
  const backToCategoryHref = item.isAnime
    ? "/media/anime"
    : item.contentType === "movie"
      ? "/media/movie"
      : "/media/series";
  const backToListHref = resolveReturnHref(searchParams.get("from"), backToCategoryHref);
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
  const recommendedTorrent = pickRecommendedTorrent(torrents);
  const favoriteTarget = recommendedTorrent || torrents[0] || null;
  const isFavorited = favoriteTarget ? hasFavorite(favoriteTarget.infoHash) : false;
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
  const subtitleLinks = payload.playerEnabled
    ? (payload.subtitleTemplates ?? [])
      .map((template) => {
        const href = applySubtitleTemplate(template.urlTemplate, selectedDisplayTitle || originalDisplayTitle, item.releaseYear);
        if (!href) {
          return null;
        }
        return {
          id: template.id,
          label: template.name?.trim() || t("media.detail.subtitleTemplateFallback"),
          href
        };
      })
      .filter((entry): entry is { id: string; label: string; href: string } => Boolean(entry))
    : [];
  const externalLinkCards = [
    ...quickExternalLinks.map((link) => ({
      id: `external:${link.key}:${link.href}`,
      kind: "external" as const,
      key: link.key,
      label: link.label,
      value: compactInlineValue(link.value || link.href),
      href: link.href
    })),
    ...subtitleLinks.map((link) => ({
      id: `subtitle:${link.id}`,
      kind: "subtitle" as const,
      key: "subtitle",
      label: link.label,
      value: compactInlineValue(link.href),
      href: link.href
    }))
  ];
  const externalGridStyle = {
    "--media-external-cols": String(Math.max(1, Math.min(3, externalLinkCards.length)))
  } as CSSProperties;

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

  const backToListLabel = item.isAnime
    ? t("media.detail.backToAnimeList")
    : item.contentType === "movie"
      ? t("media.detail.backToMovieList")
      : t("media.detail.backToSeriesList");

  const toggleFavoriteFromDetail = async () => {
    if (!favoriteTarget) {
      notifications.show({ color: "yellow", message: t("media.detail.noFavoriteTarget") });
      return;
    }
    if (!user) {
      notifications.show({ color: "yellow", message: t("auth.needLogin") });
      return;
    }

    const removing = hasFavorite(favoriteTarget.infoHash);
    try {
      await toggleFavorite(favoriteTarget.infoHash);
      notifications.show({
        color: "green",
        message: removing ? t("profile.favoriteRemoved") : t("profile.favoriteAdded")
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleClearTorrentCache = async () => {
    if (cachedTaskInfoHashes.length === 0) {
      notifications.show({ color: "yellow", message: t("media.detail.cacheEmpty") });
      return;
    }
    const confirmed = window.confirm(t("media.detail.cacheClearConfirm"));
    if (!confirmed) {
      return;
    }
    setCacheClearing(true);
    try {
      const result = await clearPlayerTransmissionCache(cachedTaskInfoHashes);
      notifications.show({
        color: "green",
        message: `${t("media.detail.cacheCleared")} (${result.removed || 0})`
      });
      await refreshPlayerStatuses(torrents);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setCacheClearing(false);
    }
  };

  return (
    <div className="media-detail-page-wrap">
      {coverBackdrop ? <div className="media-global-backdrop" style={{ backgroundImage: `url(${coverBackdrop})` }} /> : null}
      {coverBackdrop ? <div className="media-global-backdrop-mask" /> : null}

      <Stack gap="md" className="media-detail-page-content">
        <Group justify="space-between" wrap="wrap">
          <Button renderRoot={(props) => <Link href={backToListHref} {...props} />} leftSection={<ArrowLeft size={14} />} variant="light">
            {backToListLabel}
          </Button>
          <Group gap="xs">
            <ActionIcon
              className="app-icon-btn"
              size={36}
              variant={isFavorited ? "light" : "default"}
              color={isFavorited ? "red" : undefined}
              onClick={() => void toggleFavoriteFromDetail()}
              aria-label={isFavorited ? t("profile.removeFavorite") : t("profile.addFavorite")}
              disabled={!favoriteTarget}
            >
              <Heart size={16} fill={isFavorited ? "currentColor" : "none"} />
            </ActionIcon>
            <Button variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void load(true)}>
              {t("common.refresh")}
            </Button>
          </Group>
        </Group>

        <Card className="glass-card media-detail-hero" withBorder>
          <div className="media-detail-hero-layout">
            <div className="media-detail-hero-poster-shell">
              {poster ? (
                <CoverImage src={poster} alt={item.title} w={360} radius="md" />
              ) : (
                <Card withBorder w={220} h={320} className="media-poster-fallback-card">
                  <Text c="dimmed">{t("media.noPoster")}</Text>
                </Card>
              )}
            </div>
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


              {aliases.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {aliases.slice(0, 6).map((alias) => (
                    <Badge key={alias} variant="dot" color="slate">{alias}</Badge>
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
                    <Badge key={genre} variant="dot" color="slate">{genre}</Badge>
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

              {selectedOverview ? <Text c="dimmed" className="entity-subtitle media-detail-overview-text">{selectedOverview}</Text> : null}
            </Stack>
          </div>
        </Card>

        {(externalLinkCards.length > 0 || recommendedTorrent) ? (
          <div className="media-detail-sidecars">
            {externalLinkCards.length > 0 ? (
              <Card className="media-detail-sidecar-card media-external-card" withBorder>
                <Text fw={600} mb="sm">{t("media.detail.externalLinks")}</Text>
                <div className="media-external-links-grid" style={externalGridStyle}>
                  {externalLinkCards.map((link) => (
                    <div key={link.id} className="media-external-link-row">
                      <div className="media-external-link-main">
                        <Text
                          size="sm"
                          fw={700}
                          className="card-title media-external-link-title"
                          title={link.kind === "subtitle" ? link.label : undefined}
                        >
                          {link.kind === "subtitle"
                            ? link.label
                            : link.key === "tmdb" || link.key === "imdb" || link.key === "tvdb" || link.key === "douban"
                              ? t(`media.sources.${link.key}`)
                              : link.key === "homepage"
                                ? t("media.detail.homepage")
                                : link.label}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          className="media-external-link-value"
                          title={link.value}
                        >
                          {link.value}
                        </Text>
                      </div>
                      <Button
                        component="a"
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="media-external-link-action"
                        variant="light"
                        size="xs"
                        rightSection={<ExternalLink size={13} />}
                      >
                        {t("media.detail.openLink")}
                      </Button>
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
                    <Badge key={`${recommendedTorrent.infoHash}:${source.key}`} variant="dot" color="slate">
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
          <Group justify="space-between" align="flex-start" mb="sm" gap="sm" wrap="wrap">
            <Group gap="xs">
              <Text fw={600}>{t("media.detail.torrentInfo")}</Text>
              <Badge variant="light">{filteredTorrents.length} / {torrents.length}</Badge>
            </Group>
            <Group gap="xs" className="media-torrent-quick-filters">
              <button
                type="button"
                className={torrentResolutionFilter === "all" ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
                onClick={() => setTorrentResolutionFilter("all")}
              >
                {t("media.all")}
              </button>
              {torrentResolutionOptions.map((resolution) => {
                const value = resolution.toLowerCase();
                return (
                  <button
                    key={resolution}
                    type="button"
                    className={torrentResolutionFilter === value ? "media-filter-pill media-filter-pill-active" : "media-filter-pill"}
                    onClick={() => setTorrentResolutionFilter(value)}
                  >
                    {resolution}
                  </button>
                );
              })}
              <Checkbox
                size="xs"
                checked={torrentCachedOnly}
                onChange={(event) => setTorrentCachedOnly(event.currentTarget.checked)}
                label={t("media.detail.cacheOnly")}
              />
              <Tooltip label={t("media.detail.clearCache")}>
                <ActionIcon
                  className="app-icon-btn"
                  size="sm"
                  variant="default"
                  color="red"
                  disabled={cachedTaskInfoHashes.length === 0 || cacheClearing}
                  onClick={() => void handleClearTorrentCache()}
                  aria-label={t("media.detail.clearCache")}
                >
                  {cacheClearing ? <Loader size={14} /> : <Trash2 size={14} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {filteredTorrents.length === 0 ? (
            <Text c="dimmed">{t("media.noResults")}</Text>
          ) : (
            <>
              <ScrollArea>
                <Table className="media-torrent-snapshot-table" striped withTableBorder highlightOnHover miw={920}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("torrents.table.title")}</Table.Th>
                      <Table.Th>{t("torrents.table.seeders")}</Table.Th>
                      <Table.Th>{t("torrents.table.leechers")}</Table.Th>
                      <Table.Th>{t("torrents.table.size")}</Table.Th>
                      <Table.Th>{t("torrents.table.filesCount")}</Table.Th>
                      <Table.Th>{t("media.detail.resolution")}</Table.Th>
                      <Table.Th>{t("torrents.table.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedTorrents.map((torrent) => (
                      <TorrentRow
                        key={torrent.infoHash}
                        item={torrent}
                        t={t}
                        playerStatus={playerStatusMap[torrent.infoHash.trim().toLowerCase()]}
                        playerEnabled={Boolean(payload.playerEnabled)}
                      />
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              {torrentTotalPages > 1 ? (
                <Group justify="flex-end" mt="sm">
                  <Pagination value={normalizedTorrentPage} onChange={setTorrentPage} total={torrentTotalPages} size="sm" />
                </Group>
              ) : null}
            </>
          )}
        </Card>

      </Stack>
    </div>
  );
}

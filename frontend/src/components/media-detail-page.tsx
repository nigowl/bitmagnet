"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ArrowLeft, Heart, HeartOff, RefreshCw } from "lucide-react";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import {
  clearPlayerTransmissionCache,
  fetchMediaDetail,
  fetchPlayerTransmissionBatchStatus,
  type MediaDetailResponse,
  type MediaDetailTorrent,
  type PlayerTransmissionTaskStatus
} from "@/lib/media-api";
import { buildMediaExternalLinks, extractMediaFacts, formatQualityTag, getBackdropUrl, getPosterUrl, pickRecommendedTorrent, pickRecommendedTorrents } from "@/lib/media";
import {
  applySubtitleTemplate,
  buildMediaDetailMetaRows,
  compactInlineValue,
  compareMediaDetailTorrents,
  displayResolution,
  fallbackCategoryHref,
  firstNonEmpty,
  isTransmissionTaskComplete,
  normalizeResolutionFilter,
  resolutionSortValue,
  resolveReturnHref,
  sameText,
  uniqueValues
} from "./media-detail-page.helpers";
import { useMediaEpisodeGroups } from "./media-detail-page.episodes";
import { MediaEpisodePanel } from "./media-detail-page.episodes-panel";
import { MediaDetailHero } from "./media-detail-page.hero";
import { MediaDetailSidecars } from "./media-detail-page.sidecars";
import { MediaDetailTorrentsSection } from "./media-detail-page.torrents-section";

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
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState<string | null>(null);
  const cacheFilterAutoAppliedRef = useRef("");
  const titleLanguage = locale === "en" ? "en" : "zh";
  const detailTorrents = payload?.torrents ?? [];
  const isSeriesDetail = payload?.item.contentType === "tv_show" || payload?.item.contentType === "series";
  const episodeGroupsState = useMediaEpisodeGroups({
    enabled: isSeriesDetail,
    torrents: detailTorrents
  });

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [mediaId, mediaType]);

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
    setTorrentCachedOnly(false);
    setSelectedEpisodeKey(null);
    cacheFilterAutoAppliedRef.current = "";
  }, [payload?.item.id]);

  useEffect(() => {
    const itemKey = payload?.item.id || "";
    if (!itemKey || cacheFilterAutoAppliedRef.current === itemKey) return;
    const torrents = payload?.torrents ?? [];
    if (torrents.length === 0) return;
    if (Object.keys(playerStatusMap).length === 0) return;
    cacheFilterAutoAppliedRef.current = itemKey;
    const hasCompletedCache = torrents.some((torrent) =>
      isTransmissionTaskComplete(playerStatusMap[torrent.infoHash.trim().toLowerCase()])
    );
    if (hasCompletedCache) {
      setTorrentCachedOnly(true);
      setTorrentPage(1);
    }
  }, [payload?.item.id, payload?.torrents, playerStatusMap]);

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
            size="sm"
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
  const selectedEpisodeGroup = episodeGroupsState.groups.find((group) => group.key === selectedEpisodeKey) ?? null;
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
  }).sort(compareMediaDetailTorrents);
  const cachedTaskInfoHashes = torrents
    .filter((torrent) => playerStatusMap[torrent.infoHash.trim().toLowerCase()]?.exists)
    .map((torrent) => torrent.infoHash);
  const torrentTotalPages = Math.max(1, Math.ceil(filteredTorrents.length / torrentPageSize));
  const normalizedTorrentPage = Math.max(1, Math.min(torrentPage, torrentTotalPages));
  const pagedTorrents = filteredTorrents.slice((normalizedTorrentPage - 1) * torrentPageSize, normalizedTorrentPage * torrentPageSize);
  const backToCategoryHref = item.contentType === "movie"
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
  const recommendedTorrents = pickRecommendedTorrents(torrents, 6)
    .sort((left, right) => {
      const leftCached = isTransmissionTaskComplete(playerStatusMap[left.infoHash.trim().toLowerCase()]) ? 1 : 0;
      const rightCached = isTransmissionTaskComplete(playerStatusMap[right.infoHash.trim().toLowerCase()]) ? 1 : 0;
      if (leftCached !== rightCached) return rightCached - leftCached;
      return 0;
    })
    .slice(0, 2);
  const recommendedTorrent = recommendedTorrents[0] || pickRecommendedTorrent(torrents);
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
  const episodePanel = isSeriesDetail ? (
    <MediaEpisodePanel
      t={t}
      groups={episodeGroupsState.groups}
      loading={episodeGroupsState.loading}
      error={episodeGroupsState.error}
      selectedGroup={selectedEpisodeGroup}
      playerStatusMap={playerStatusMap}
      playerEnabled={Boolean(payload.playerEnabled)}
      onOpenEpisode={setSelectedEpisodeKey}
      onCloseEpisode={() => setSelectedEpisodeKey(null)}
    />
  ) : null;

  const metaRows = buildMediaDetailMetaRows({ t, item, releaseInfo, languageInfo });

  const backToListLabel = item.contentType === "movie"
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
          <Button size="sm" renderRoot={(props) => <Link href={backToListHref} {...props} />} leftSection={<ArrowLeft size={14} />} variant="light">
            {backToListLabel}
          </Button>
          <Group gap="xs">
            <Button
              size="sm"
              leftSection={isFavorited ? <HeartOff size={14} /> : <Heart size={14} />}
              variant={isFavorited ? "light" : "default"}
              onClick={() => void toggleFavoriteFromDetail()}
              aria-label={isFavorited ? t("profile.removeFavorite") : t("profile.addFavorite")}
              disabled={!favoriteTarget}
            >
              {isFavorited ? t("profile.removeFavorite") : t("profile.addFavorite")}
            </Button>
            <Button size="sm" variant="default" leftSection={<RefreshCw size={14} />} onClick={() => void load(true)}>
              {t("common.refresh")}
            </Button>
          </Group>
        </Group>

        <MediaDetailHero
          t={t}
          poster={poster}
          itemTitle={item.title}
          originalDisplayTitle={originalDisplayTitle}
          selectedDisplayTitle={selectedDisplayTitle}
          showSelectedDisplayTitle={showSelectedDisplayTitle}
          aliases={aliases}
          contentType={item.contentType}
          isAnime={item.isAnime}
          releaseYear={item.releaseYear}
          voteAverage={item.voteAverage}
          torrentCount={item.torrentCount}
          genreNames={genreNames}
          qualityTags={qualityTags}
          languageNames={languageNames}
          selectedOverview={selectedOverview}
          episodePanel={episodePanel}
        />

        <MediaDetailSidecars
          t={t}
          externalLinkCards={externalLinkCards}
          externalGridStyle={externalGridStyle}
          recommendedTorrents={recommendedTorrents}
          playerStatusMap={playerStatusMap}
        />

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

        <MediaDetailTorrentsSection
          t={t}
          torrents={torrents}
          filteredTorrents={filteredTorrents}
          pagedTorrents={pagedTorrents}
          playerStatusMap={playerStatusMap}
          playerEnabled={Boolean(payload.playerEnabled)}
          torrentResolutionFilter={torrentResolutionFilter}
          torrentResolutionOptions={torrentResolutionOptions}
          torrentCachedOnly={torrentCachedOnly}
          cachedTaskInfoHashes={cachedTaskInfoHashes}
          cacheClearing={cacheClearing}
          torrentTotalPages={torrentTotalPages}
          normalizedTorrentPage={normalizedTorrentPage}
          payload={payload}
          onChangeResolutionFilter={setTorrentResolutionFilter}
          onChangeCachedOnly={setTorrentCachedOnly}
          onClearCache={() => void handleClearTorrentCache()}
          onChangePage={setTorrentPage}
        />

      </Stack>
    </div>
  );
}

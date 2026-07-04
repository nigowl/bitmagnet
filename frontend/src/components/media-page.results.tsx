"use client";

import Link from "next/link";
import { Card, Group, Loader, Pagination, Text } from "@mantine/core";
import { Download, ListOrdered, Star } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getOriginalTitleIfDifferent, getPosterUrl, pickBestQualityTag, uniqueMediaTags } from "@/lib/media";
import type { MediaListItem } from "@/lib/media-api";
import { localizeGenreLabel } from "./media-page.helpers";

type MediaResultsSectionProps = {
  t: (key: string) => string;
  loading: boolean;
  items: MediaListItem[];
  titleLanguage: "zh" | "en";
  currentListHref: string;
  totalCount: number;
  page: number;
  totalPages: number;
  onChangePage: (value: number) => void;
};

export function MediaResultsSection({
  t,
  loading,
  items,
  titleLanguage,
  currentListHref,
  totalCount,
  page,
  totalPages,
  onChangePage
}: MediaResultsSectionProps) {
  if (loading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="glass-card" withBorder>
        <Text c="dimmed">{t("media.noResults")}</Text>
      </Card>
    );
  }

  return (
    <>
      <div className="media-wall">
        {items.map((item) => (
          <MediaWallItem
            key={item.id}
            item={item}
            t={t}
            titleLanguage={titleLanguage}
            currentListHref={currentListHref}
          />
        ))}
      </div>

      <Card className="glass-card media-toolbar-pagination" withBorder>
        <Group justify="space-between" wrap="wrap">
          <Text c="dimmed" size="sm">{t("media.results")}: {totalCount} / Page {page}</Text>
          <Pagination
            total={totalPages}
            value={page}
            onChange={onChangePage}
            siblings={1}
            boundaries={1}
          />
        </Group>
      </Card>
    </>
  );
}

function MediaWallItem({
  item,
  t,
  titleLanguage,
  currentListHref
}: {
  item: MediaListItem;
  t: (key: string) => string;
  titleLanguage: "zh" | "en";
  currentListHref: string;
}) {
  const poster = getPosterUrl(item, "md");
  const titleText = getDisplayTitle(item, titleLanguage);
  const qualityTags = uniqueMediaTags(item.qualityTags);
  const genreTags = uniqueMediaTags(item.genres);
  const primaryQuality = pickBestQualityTag(qualityTags);
  const primaryGenre = genreTags[0] || null;
  const primaryGenreLabel = primaryGenre ? localizeGenreLabel(primaryGenre, t) : null;
  const originalTitle = getOriginalTitleIfDifferent(item, titleText);
  const categoryLabel = item.isAnime
    ? t("nav.anime")
    : (item.contentType ? t(`contentTypes.${item.contentType}`) : null);
  const factGroups = extractMediaFacts({
    collections: item.collections ?? [],
    attributes: item.attributes ?? []
  });
  const factMap = new Map(factGroups.map((group) => [group.key, group.values]));
  const mediaMeta = [
    { label: t("media.filters.awards"), values: factMap.get("awards") ?? [] }
  ]
    .filter((entry) => entry.values.length > 0)
    .map((entry) => `${entry.label}: ${entry.values.slice(0, 2).join(" / ")}`);
  const infoLine = [item.releaseYear ? String(item.releaseYear) : null, primaryGenreLabel].filter(Boolean);
  const stats = [
    { label: t("media.sort.rating"), icon: <Star size={12} />, value: item.voteAverage ? item.voteAverage.toFixed(1) : "-" },
    { label: t("media.torrentCount"), icon: <ListOrdered size={12} />, value: formatStatNumber(item.torrentCount) },
    { label: t("media.sort.download"), icon: <Download size={12} />, value: formatStatNumber(item.maxSeeders) }
  ];

  return (
    <div className="media-wall-item">
      <Link href={buildMediaDetailHref(item, currentListHref)} className="unstyled-link">
        <article className="media-wall-card">
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
            <div className="media-wall-overlay media-wall-overlay-bottom media-wall-overlay-stats">
              {stats.map((stat) => (
                <span key={`${item.id}:${stat.label}`} className="media-poster-chip media-poster-stat-chip" title={stat.label} aria-label={`${stat.label}: ${stat.value}`}>
                  {stat.icon}
                  <strong>{stat.value}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="media-wall-content">
            {originalTitle ? <div className="media-wall-subtitle">{originalTitle}</div> : null}
            <div className="media-wall-title">{titleText}</div>
            {infoLine.length > 0 ? <div className="media-wall-facts">{infoLine.join(" · ")}</div> : null}
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

function formatStatNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return String(Math.min(999, Math.max(0, Math.floor(value))));
}

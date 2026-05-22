"use client";

import Link from "next/link";
import { Card, Group, Loader, Pagination, Text } from "@mantine/core";
import { ListOrdered, Users } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getPosterUrl, pickBestQualityTag } from "@/lib/media";
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
  const originalTitleText = getDisplayTitle(item, "original");
  const qualityTags = Array.from(new Set((item.qualityTags ?? []).map((tag) => tag.trim()).filter(Boolean)));
  const genreTags = Array.from(new Set((item.genres ?? []).filter(Boolean)));
  const primaryQuality = pickBestQualityTag(qualityTags);
  const primaryGenre = genreTags[0] || null;
  const primaryGenreLabel = primaryGenre ? localizeGenreLabel(primaryGenre, t) : null;
  const originalTitle = originalTitleText.trim().toLowerCase() !== titleText.trim().toLowerCase()
    ? originalTitleText
    : null;
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
  const maxSeedersText = item.maxSeeders != null ? String(item.maxSeeders) : "-";

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

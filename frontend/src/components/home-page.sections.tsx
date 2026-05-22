"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Card, Group, Loader, Skeleton, Stack, Text } from "@mantine/core";
import { ChevronLeft, ChevronRight, ListOrdered, Users } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { buildMediaDetailHref, extractMediaFacts, getDisplayTitle, getPosterUrl, pickBestQualityTag } from "@/lib/media";
import type { MediaListItem } from "@/lib/media-api";

const DAILY_CAROUSEL_INTERVAL_MS = 5600;

type Translate = (key: string) => string;
type TitleLanguage = "zh" | "en";

function MediaWallCard({
  item,
  t,
  titleLanguage,
  sourceHref
}: {
  item: MediaListItem;
  t: Translate;
  titleLanguage: TitleLanguage;
  sourceHref: string;
}) {
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
    <div className="media-wall-item">
      <Link href={buildMediaDetailHref(item, sourceHref)} className="unstyled-link">
        <article className="media-wall-card home-media-card">
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
}

export function HomeLoadingSkeleton() {
  return (
    <Stack gap="md" className="home-loading-shell">
      <div className="home-loading-block">
        <Skeleton height={22} width={180} radius="xl" />
        <Skeleton height={14} width="34%" mt={10} radius="xl" />
        <div className="home-loading-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="home-loading-tile">
              <Skeleton height={320} radius="md" />
              <Skeleton height={14} width="82%" mt={12} radius="xl" />
              <Skeleton height={12} width="58%" mt={8} radius="xl" />
            </div>
          ))}
        </div>
      </div>
    </Stack>
  );
}

export function HomeSection({
  title,
  items,
  displayLimit,
  loading,
  emptyText,
  t,
  titleLanguage,
  sourceHref
}: {
  title: string;
  items: MediaListItem[];
  displayLimit: number;
  loading: boolean;
  emptyText: string;
  t: Translate;
  titleLanguage: TitleLanguage;
  sourceHref: string;
}) {
  const sectionItems = items.slice(0, displayLimit);

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
        <div className="media-wall">
          {sectionItems.map((item) => (
            <MediaWallCard key={item.id} item={item} t={t} titleLanguage={titleLanguage} sourceHref={sourceHref} />
          ))}
        </div>
      )}
    </Stack>
  );
}

export function DailyPicksCarousel({
  title,
  items,
  displayLimit,
  loading,
  emptyText,
  t,
  titleLanguage,
  sourceHref
}: {
  title: string;
  items: MediaListItem[];
  displayLimit: number;
  loading: boolean;
  emptyText: string;
  t: Translate;
  titleLanguage: TitleLanguage;
  sourceHref: string;
}) {
  const sectionItems = items.slice(0, displayLimit);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const loopResetTimerRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeVirtualIndex, setActiveVirtualIndex] = useState(displayLimit);
  const loopSize = sectionItems.length;
  const loopedItems = useMemo(
    () => (loopSize > 1 ? [...sectionItems, ...sectionItems, ...sectionItems] : sectionItems),
    [loopSize, sectionItems]
  );
  const renderedVirtualIndex = loopSize > 1
    ? (
      activeVirtualIndex >= 0 && activeVirtualIndex < loopSize * 3
        ? activeVirtualIndex
        : (((activeVirtualIndex % loopSize) + loopSize) % loopSize) + loopSize
    )
    : 0;

  const jumpToVirtualIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const scroller = trackRef.current;
    if (!scroller) return;
    const target = itemRefs.current[index];
    if (!target) return;
    const centeredLeft = target.offsetLeft - ((scroller.clientWidth - target.clientWidth) / 2);
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextLeft = Math.min(Math.max(0, centeredLeft), maxScrollLeft);
    scroller.scrollTo({ left: nextLeft, behavior });
  }, []);

  const scheduleLoopReset = useCallback((index: number) => {
    if (loopSize <= 1) return;
    if (loopResetTimerRef.current != null) {
      window.clearTimeout(loopResetTimerRef.current);
    }

    if (index >= loopSize * 2 || index < loopSize) {
      const normalized = (((index % loopSize) + loopSize) % loopSize) + loopSize;
      loopResetTimerRef.current = window.setTimeout(() => {
        setActiveVirtualIndex(normalized);
        jumpToVirtualIndex(normalized, "auto");
      }, 620);
    }
  }, [jumpToVirtualIndex, loopSize]);

  const goToIndex = useCallback((nextIndex: number) => {
    if (loopSize === 0) {
      setActiveVirtualIndex(0);
      return;
    }
    const normalized = ((nextIndex % loopSize) + loopSize) % loopSize;
    const nextVirtual = loopSize + normalized;
    setActiveVirtualIndex(nextVirtual);
    jumpToVirtualIndex(nextVirtual, "smooth");
  }, [jumpToVirtualIndex, loopSize]);

  const scrollToActive = useCallback(() => {
    if (loopSize === 0) return;
    jumpToVirtualIndex(renderedVirtualIndex, "smooth");
  }, [jumpToVirtualIndex, loopSize, renderedVirtualIndex]);

  const move = useCallback((direction: "prev" | "next") => {
    if (loopSize <= 1) return;
    const nextVirtual = renderedVirtualIndex + (direction === "next" ? 1 : -1);
    setActiveVirtualIndex(nextVirtual);
    scheduleLoopReset(nextVirtual);
  }, [loopSize, renderedVirtualIndex, scheduleLoopReset]);

  const getItemState = useCallback((index: number): "active" | "near" | "far" => {
    if (loopSize <= 1) return "active";
    const distance = Math.abs(index - renderedVirtualIndex);
    if (distance === 0) return "active";
    if (distance === 1) return "near";
    return "far";
  }, [loopSize, renderedVirtualIndex]);

  useEffect(() => {
    scrollToActive();
  }, [scrollToActive]);

  useEffect(() => () => {
    if (loopResetTimerRef.current != null) {
      window.clearTimeout(loopResetTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (loopSize <= 1 || paused || loading) return;
    const timer = window.setInterval(() => {
      move("next");
    }, DAILY_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loading, loopSize, move, paused]);

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
        <div className="home-daily-carousel-shell" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div ref={trackRef} className="home-daily-carousel-track">
            {loopedItems.map((item, index) => (
              <div
                key={`${item.id}:${index}`}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="home-daily-carousel-item"
                data-state={getItemState(index)}
                onClick={() => goToIndex(index)}
              >
                <MediaWallCard item={item} t={t} titleLanguage={titleLanguage} sourceHref={sourceHref} />
              </div>
            ))}
          </div>

          {sectionItems.length > 1 ? (
            <>
              <ActionIcon
                className="app-icon-btn home-daily-carousel-control home-daily-carousel-control-prev"
                variant="filled"
                color="slate"
                aria-label="Previous slide"
                onClick={() => move("prev")}
              >
                <ChevronLeft size={16} />
              </ActionIcon>
              <ActionIcon
                className="app-icon-btn home-daily-carousel-control home-daily-carousel-control-next"
                variant="filled"
                color="slate"
                aria-label="Next slide"
                onClick={() => move("next")}
              >
                <ChevronRight size={16} />
              </ActionIcon>
            </>
          ) : null}
        </div>
      )}
    </Stack>
  );
}

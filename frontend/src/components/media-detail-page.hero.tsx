"use client";

import type { ReactNode } from "react";
import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { CoverImage } from "@/components/cover-image";

type MediaDetailHeroProps = {
  t: (key: string) => string;
  poster: string | null;
  itemTitle: string;
  originalDisplayTitle: string;
  selectedDisplayTitle: string;
  showSelectedDisplayTitle: boolean;
  aliases: string[];
  contentType: string;
  isAnime: boolean;
  releaseYear?: number | null;
  voteAverage?: number | null;
  torrentCount: number;
  genreNames: string[];
  qualityTags: string[];
  languageNames: string[];
  selectedOverview?: string | null;
  episodePanel?: ReactNode;
};

export function MediaDetailHero({
  t,
  poster,
  itemTitle,
  originalDisplayTitle,
  selectedDisplayTitle,
  showSelectedDisplayTitle,
  aliases,
  contentType,
  isAnime,
  releaseYear,
  voteAverage,
  torrentCount,
  genreNames,
  qualityTags,
  languageNames,
  selectedOverview,
  episodePanel
}: MediaDetailHeroProps) {
  return (
    <Card className="glass-card media-detail-hero" withBorder>
      <div className="media-detail-hero-layout">
        <div className="media-detail-hero-poster-shell">
          {poster ? (
            <CoverImage src={poster} alt={itemTitle} w={360} radius="md" />
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
            <Badge variant="light">{t(`contentTypes.${contentType}`)}</Badge>
            {isAnime ? <Badge variant="light" color="orange">{t("nav.anime")}</Badge> : null}
            {releaseYear ? <Badge variant="light">{releaseYear}</Badge> : null}
            {voteAverage ? <Badge variant="light">★ {voteAverage.toFixed(1)}</Badge> : null}
            <Badge variant="outline">{t("media.torrentCount")}: {torrentCount}</Badge>
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
          {episodePanel}
        </Stack>
      </div>
    </Card>
  );
}

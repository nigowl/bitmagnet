"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ActionIcon, Badge, Button, Card, Group, Stack, Text, Tooltip } from "@mantine/core";
import { ExternalLink, Eye } from "lucide-react";
import type { MediaDetailTorrent, PlayerTransmissionTaskStatus } from "@/lib/media-api";
import { formatQualityTag } from "@/lib/media";
import { displayResolution, formatBytes, isTransmissionTaskComplete } from "./media-detail-page.helpers";

type ExternalLinkCard = {
  id: string;
  kind: "external" | "subtitle";
  key: string;
  label: string;
  value: string;
  href: string;
};

type MediaDetailSidecarsProps = {
  t: (key: string) => string;
  externalLinkCards: ExternalLinkCard[];
  externalGridStyle: CSSProperties;
  recommendedTorrents: MediaDetailTorrent[];
  playerStatusMap: Record<string, PlayerTransmissionTaskStatus>;
};

export function MediaDetailSidecars({
  t,
  externalLinkCards,
  externalGridStyle,
  recommendedTorrents,
  playerStatusMap
}: MediaDetailSidecarsProps) {
  if (externalLinkCards.length === 0 && recommendedTorrents.length === 0) {
    return null;
  }

  return (
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
                    {resolveExternalLinkLabel(link, t)}
                  </Text>
                  <Text size="xs" c="dimmed" className="media-external-link-value" title={link.value}>
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

      {recommendedTorrents.length > 0 ? (
        <Card className="media-detail-sidecar-card media-recommend-card" withBorder>
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Text fw={600} className="card-title">{t("media.detail.recommendedTorrent")}</Text>
              <Text size="sm" c="dimmed" mt={4} lineClamp={1} className="entity-subtitle">
                {t("media.detail.bestChoice")}
              </Text>
            </div>
            <Badge variant="light" color="orange">
              TOP {recommendedTorrents.length}
            </Badge>
          </Group>

          <Stack gap="xs" mt="sm">
            {recommendedTorrents.map((torrent, index) => (
              <div key={torrent.infoHash} className="media-recommend-item">
                <div className="media-recommend-item-main">
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant={index === 0 ? "filled" : "light"} color="orange">
                      #{index + 1}
                    </Badge>
                    {isTransmissionTaskComplete(playerStatusMap[torrent.infoHash.trim().toLowerCase()]) ? (
                      <Badge size="xs" variant="light" color="green">{t("media.cacheBadge")}</Badge>
                    ) : null}
                  </Group>
                  <Text size="sm" fw={700} lineClamp={1} title={torrent.title || torrent.torrent.name}>
                    {torrent.title || torrent.torrent.name}
                  </Text>
                  <Group gap={6} wrap="wrap">
                    {torrent.videoResolution ? (
                      <Badge size="xs" variant="light" color="orange">{displayResolution(torrent.videoResolution)}</Badge>
                    ) : null}
                    {torrent.videoSource ? (
                      <Badge size="xs" variant="light">{formatQualityTag(torrent.videoSource)}</Badge>
                    ) : null}
                    {torrent.seeders ? (
                      <Badge size="xs" variant="outline">{t("torrents.table.seeders")}: {torrent.seeders}</Badge>
                    ) : null}
                    <Badge size="xs" variant="outline">{formatBytes(torrent.size)}</Badge>
                  </Group>
                </div>
                <Group gap={6} wrap="nowrap">
                  <Tooltip label={t("media.openTorrent")}>
                    <ActionIcon
                      className="app-icon-btn"
                      size="sm"
                      variant="light"
                      color="orange"
                      aria-label={t("media.openTorrent")}
                      renderRoot={(props) => <Link href={`/torrents/${torrent.infoHash}`} {...props} />}
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
                      component="a"
                      href={torrent.torrent.magnetUri}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("media.openMagnet")}
                    >
                      <ExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>
            ))}
          </Stack>
        </Card>
      ) : null}
    </div>
  );
}

function resolveExternalLinkLabel(link: ExternalLinkCard, t: (key: string) => string): string {
  if (link.kind === "subtitle") return link.label;
  if (link.key === "tmdb" || link.key === "imdb" || link.key === "tvdb" || link.key === "douban") {
    return t(`media.sources.${link.key}`);
  }
  if (link.key === "homepage") return t("media.detail.homepage");
  return link.label;
}

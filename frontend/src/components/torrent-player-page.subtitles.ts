"use client";

import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { notifications } from "@mantine/notifications";
import {
  createPlayerSubtitle,
  deletePlayerSubtitle,
  fetchMediaDetail,
  fetchPlayerSubtitleContent,
  fetchPlayerSubtitles,
  updatePlayerSubtitle,
  type PlayerSubtitleItem
} from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type TorrentDetailLite = player.TorrentDetailLite;
type PlayerSubtitleSiteLink = player.PlayerSubtitleSiteLink;
type SubtitleCue = player.SubtitleCue;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerSubtitlesArgs = {
  t: TFunction;
  locale: string;
  infoHash: string;
  detail: TorrentDetailLite | null;
  subtitleStyleVerticalPercent: number;
  subtitleLoadTokenRef: MutableRefObject<number>;
  logInfo: LogFn;
  logWarn: LogFn;
};

export function useTorrentPlayerSubtitles({
  t,
  locale,
  infoHash,
  detail,
  subtitleStyleVerticalPercent,
  subtitleLoadTokenRef,
  logInfo,
  logWarn
}: UseTorrentPlayerSubtitlesArgs) {
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleItems, setSubtitleItems] = useState<PlayerSubtitleItem[]>([]);
  const [subtitleSiteLinks, setSubtitleSiteLinks] = useState<PlayerSubtitleSiteLink[]>([]);
  const [subtitleCueMap, setSubtitleCueMap] = useState<Record<number, SubtitleCue[]>>({});
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("none");

  const resetSubtitles = useCallback(() => {
    setSubtitleItems([]);
    setSubtitleCueMap({});
    setSelectedSubtitleId("none");
  }, []);

  const loadSubtitles = useCallback(async () => {
    if (!infoHash) return;
    const loadToken = subtitleLoadTokenRef.current + 1;
    subtitleLoadTokenRef.current = loadToken;
    setSubtitleLoading(true);
    try {
      const items = await fetchPlayerSubtitles(infoHash);
      if (subtitleLoadTokenRef.current !== loadToken) return;
      const filtered = items.filter((item) => item.infoHash.trim().toLowerCase() === infoHash);
      setSubtitleItems(filtered);
      logInfo("subtitle", "subtitle list loaded", { count: filtered.length });
    } catch (error) {
      if (subtitleLoadTokenRef.current !== loadToken) return;
      const rawMessage = player.toErrorMessage(error, t("media.player.subtitleUploadFailed"));
      const message = player.normalizePlayerErrorMessage(rawMessage, t);
      if (rawMessage.trim().toLowerCase().includes("player disabled")) {
        resetSubtitles();
      }
      logWarn("subtitle", "failed to load subtitles", { message });
    } finally {
      if (subtitleLoadTokenRef.current !== loadToken) return;
      setSubtitleLoading(false);
    }
  }, [infoHash, logInfo, logWarn, resetSubtitles, subtitleLoadTokenRef, t]);

  useEffect(() => {
    if (!infoHash || subtitleItems.length === 0) {
      setSubtitleCueMap({});
      return;
    }

    const effectiveOffsetBySubtitleID = new Map<number, number>(
      subtitleItems.map((item) => {
        const manualOffsetSeconds = Number.isFinite(item.offsetSeconds) ? item.offsetSeconds : 0;
        return [item.id, -manualOffsetSeconds];
      })
    );
    let cancelled = false;
    const buildTrackSources = async () => {
      const nextCues: Record<number, SubtitleCue[]> = {};

      for (const item of subtitleItems) {
        const effectiveOffsetSeconds = effectiveOffsetBySubtitleID.get(item.id) || 0;
        try {
          const raw = await fetchPlayerSubtitleContent(infoHash, item.id);
          const shifted = Math.abs(effectiveOffsetSeconds) >= 0.1
            ? player.shiftWebVttByOffset(raw, effectiveOffsetSeconds)
            : player.ensureWebVtt(raw);
          const positioned = player.applyWebVttCueLine(shifted, subtitleStyleVerticalPercent);
          nextCues[item.id] = player.parseWebVttCues(positioned);
        } catch (error) {
          nextCues[item.id] = [];
          logWarn("subtitle", "failed to build subtitle track source", {
            subtitleId: item.id,
            offsetSeconds: effectiveOffsetSeconds,
            message: player.toErrorMessage(error, "build subtitle failed")
          });
        }
      }

      if (!cancelled) {
        setSubtitleCueMap(nextCues);
      }
    };

    void buildTrackSources();
    return () => {
      cancelled = true;
    };
  }, [infoHash, logWarn, subtitleItems, subtitleStyleVerticalPercent]);

  useEffect(() => {
    const mediaEntryId = detail?.mediaEntryId;
    if (!mediaEntryId) {
      setSubtitleSiteLinks([]);
      return;
    }

    let cancelled = false;
    const loadSubtitleLinks = async () => {
      try {
        const mediaDetail = await fetchMediaDetail(mediaEntryId);
        if (cancelled) return;
        const title =
          locale === "zh"
            ? player.firstNonEmpty(mediaDetail.item.nameZh, mediaDetail.item.nameEn, mediaDetail.item.nameOriginal, mediaDetail.item.originalTitle, mediaDetail.item.title)
            : player.firstNonEmpty(mediaDetail.item.nameEn, mediaDetail.item.nameZh, mediaDetail.item.nameOriginal, mediaDetail.item.originalTitle, mediaDetail.item.title);
        const fallbackTitle = player.firstNonEmpty(title, detail.mediaTitle, detail.title) || detail.title;
        const links = (mediaDetail.subtitleTemplates ?? [])
          .map((template) => {
            const href = player.applySubtitleTemplate(template.urlTemplate, fallbackTitle, mediaDetail.item.releaseYear);
            if (!href) return null;
            return {
              id: template.id,
              label: template.name?.trim() || t("media.detail.subtitleTemplateFallback"),
              href
            };
          })
          .filter((item): item is PlayerSubtitleSiteLink => Boolean(item));
        setSubtitleSiteLinks(links);
      } catch (error) {
        if (cancelled) return;
        setSubtitleSiteLinks([]);
        logWarn("subtitle", "failed to load subtitle site links", {
          message: player.toErrorMessage(error, t("media.player.subtitleUploadFailed"))
        });
      }
    };
    void loadSubtitleLinks();

    return () => {
      cancelled = true;
    };
  }, [detail, locale, logWarn, t]);

  const handleUploadSubtitle = useCallback(
    async (file: File | null) => {
      if (!file || !infoHash) return false;
      const name = file.name || "subtitle";
      const ext = player.fileExtension(name);

      if (![".srt", ".vtt", ".ass", ".ssa"].includes(ext)) {
        notifications.show({ color: "yellow", message: t("media.player.subtitleUnsupported") });
        return false;
      }

      try {
        const raw = await player.readFileText(file);
        const contentVtt = player.convertSubtitleToVtt(name, raw);
        const label = name.replace(/\.[^.]+$/, "") || `Subtitle ${Date.now()}`;
        const language = player.normalizeSubtitleLanguage(label);

        const saved = await createPlayerSubtitle({
          infoHash,
          label,
          language,
          contentVtt
        });

        notifications.show({ color: "green", message: t("media.player.subtitleUploaded") });
        logInfo("subtitle", "subtitle uploaded", { subtitleId: saved.id, label });

        await loadSubtitles();
        setSelectedSubtitleId(String(saved.id));
        return true;
      } catch (error) {
        const message = player.toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
        logWarn("subtitle", "subtitle upload failed", { name, message });
        return false;
      }
    },
    [infoHash, loadSubtitles, logInfo, logWarn, t]
  );

  const handleDeleteSubtitle = useCallback(
    async (id: number) => {
      if (!infoHash || !Number.isInteger(id) || id <= 0) return;
      try {
        await deletePlayerSubtitle({ infoHash, subtitleId: id });
        if (selectedSubtitleId === String(id)) {
          setSelectedSubtitleId("none");
        }
        await loadSubtitles();
      } catch (error) {
        const message = player.toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
      }
    },
    [infoHash, loadSubtitles, selectedSubtitleId, t]
  );

  const handleAdjustSubtitleOffset = useCallback(
    async (id: number, deltaSeconds: number) => {
      if (!infoHash || !Number.isInteger(id) || id <= 0 || !Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
      const target = subtitleItems.find((item) => item.id === id);
      if (!target) return;
      const nextOffsetSeconds = player.normalizeSubtitleOffsetValue((target.offsetSeconds || 0) + deltaSeconds);
      try {
        await updatePlayerSubtitle({
          infoHash,
          subtitleId: id,
          offsetSeconds: nextOffsetSeconds
        });
        await loadSubtitles();
      } catch (error) {
        const message = player.toErrorMessage(error, t("media.player.subtitleUploadFailed"));
        notifications.show({ color: "red", message });
      }
    },
    [infoHash, loadSubtitles, subtitleItems, t]
  );

  const handleSubtitleUploadPick = useCallback(
    async (file: File | null) => {
      await handleUploadSubtitle(file);
    },
    [handleUploadSubtitle]
  );

  return {
    subtitleItems,
    subtitleSiteLinks,
    subtitleCueMap,
    selectedSubtitleId,
    setSelectedSubtitleId,
    subtitleLoading,
    resetSubtitles,
    loadSubtitles,
    handleSubtitleUploadPick,
    handleDeleteSubtitle,
    handleAdjustSubtitleOffset
  };
}

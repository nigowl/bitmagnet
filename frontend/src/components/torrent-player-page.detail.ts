"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_CONTENT_SEARCH_QUERY } from "@/lib/graphql";
import { buildMediaEntryIdFromContentRef, resolveMediaCategory } from "@/lib/media";
import * as player from "./torrent-player/torrent-player-helpers";

type TFunction = (key: string) => string;
type TorrentLookupResponse = player.TorrentLookupResponse;
type TorrentDetailLite = player.TorrentDetailLite;
type LogFn = (step: string, message: string, details?: unknown) => void;

type UseTorrentPlayerDetailArgs = {
  t: TFunction;
  infoHash: string;
  setDetail: Dispatch<SetStateAction<TorrentDetailLite | null>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  logInfo: LogFn;
  logWarn: LogFn;
};

export function useTorrentPlayerDetail({
  t,
  infoHash,
  setDetail,
  setPlayerError,
  logInfo,
  logWarn
}: UseTorrentPlayerDetailArgs) {
  return useCallback(async () => {
    if (!infoHash) {
      setDetail(null);
      setPlayerError(t("media.player.missingInfoHash"));
      return;
    }

    try {
      const response = await graphqlRequest<TorrentLookupResponse>(TORRENT_CONTENT_SEARCH_QUERY, {
        input: {
          infoHashes: [infoHash],
          limit: 1,
          page: 1
        }
      });
      const item = response.torrentContent.search.items[0] || null;
      if (!item) {
        setDetail(null);
        logWarn("query", "torrent detail not found", { infoHash });
        return;
      }

      const runtimeSeconds = player.resolveRuntimeSecondsFromLookup(item);
      const mediaTitles = player.resolveMediaTitlesFromLookup(item);
      const mediaTitle = mediaTitles.primary || mediaTitles.zh || mediaTitles.en;
      const mediaEntryID = buildMediaEntryIdFromContentRef(item.contentType, item.contentSource, item.contentId);
      let mediaHref: string | undefined;
      if (mediaEntryID && mediaTitle) {
        const mediaCategory = resolveMediaCategory({
          contentType: item.contentType,
          title: item.title,
          content: {
            title: item.content?.title || undefined,
            collections: Array.isArray(item.content?.collections)
              ? item.content.collections
                  .map((collection) => ({
                    type: String(collection?.type || "").trim(),
                    name: String(collection?.name || "").trim()
                  }))
                  .filter((collection) => collection.type && collection.name)
              : []
          }
        });
        mediaHref = `/media/${encodeURIComponent(mediaCategory)}/${encodeURIComponent(mediaEntryID)}`;
      }

      setDetail({
        infoHash: item.infoHash,
        title: item.title || item.torrent.name,
        contentType: String(item.contentType || "").trim() || undefined,
        seeders: item.seeders,
        leechers: item.leechers,
        magnetUri: item.torrent.magnetUri || null,
        mediaTitle: mediaTitle || undefined,
        mediaTitleZh: mediaTitles.zh || undefined,
        mediaTitleEn: mediaTitles.en || undefined,
        mediaEntryId: mediaEntryID || undefined,
        mediaHref,
        sizeBytes: Number.isFinite(item.torrent.size) ? Math.max(0, Number(item.torrent.size)) : undefined,
        filesCount: Number.isFinite(item.torrent.filesCount) ? Math.max(0, Number(item.torrent.filesCount)) : undefined,
        sourceNames: Array.isArray(item.torrent.sources)
          ? item.torrent.sources
              .map((source) => String(source?.name || "").trim())
              .filter((value) => value.length > 0)
          : [],
        tagNames: Array.isArray(item.torrent.tagNames)
          ? item.torrent.tagNames
              .map((tag) => String(tag || "").trim())
              .filter((tag) => tag.length > 0)
          : [],
        videoResolution: String(item.videoResolution || "").trim() || undefined,
        videoSource: String(item.videoSource || "").trim() || undefined,
        publishedAt: String(item.publishedAt || "").trim() || undefined,
        runtimeSeconds: runtimeSeconds > 0 ? runtimeSeconds : undefined
      });
      logInfo("query", "torrent detail loaded", {
        infoHash: item.infoHash,
        runtimeSeconds: runtimeSeconds > 0 ? runtimeSeconds : 0
      });
    } catch (error) {
      const message = player.toErrorMessage(error, t("media.player.loadFailed"));
      logWarn("query", "load torrent detail failed", { message });
      setDetail(null);
    }
  }, [infoHash, logInfo, logWarn, setDetail, setPlayerError, t]);
}

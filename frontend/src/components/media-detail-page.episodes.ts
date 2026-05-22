"use client";

import { useEffect, useMemo, useState } from "react";
import { graphqlRequest } from "@/lib/api";
import { TORRENT_FILES_QUERY } from "@/lib/graphql";
import type { MediaDetailTorrent } from "@/lib/media-api";
import {
  buildEpisodeGroups,
  groupFilesByInfoHash,
  uniqueInfoHashes,
  type TorrentFileItem
} from "./media-detail-page.episode-parser";

const EPISODE_FILE_PAGE_SIZE = 500;
const EPISODE_FILE_MAX_PAGES = 10;

type TorrentFilesResponse = {
  torrent: {
    files: {
      hasNextPage?: boolean | null;
      items?: TorrentFileItem[] | null;
    };
  };
};

export function useMediaEpisodeGroups({
  enabled,
  torrents
}: {
  enabled: boolean;
  torrents: MediaDetailTorrent[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filesByInfoHash, setFilesByInfoHash] = useState<Record<string, TorrentFileItem[]>>({});
  const infoHashKey = useMemo(() => uniqueInfoHashes(torrents).join(","), [torrents]);

  useEffect(() => {
    if (!enabled || !infoHashKey) {
      setFilesByInfoHash({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const infoHashes = infoHashKey.split(",");

    async function loadFiles() {
      setLoading(true);
      setError(null);
      try {
        const items: TorrentFileItem[] = [];
        for (let page = 1; page <= EPISODE_FILE_MAX_PAGES; page += 1) {
          const data = await graphqlRequest<TorrentFilesResponse>(TORRENT_FILES_QUERY, {
            input: {
              infoHashes,
              limit: EPISODE_FILE_PAGE_SIZE,
              page,
              hasNextPage: true
            }
          });
          const pageItems = data.torrent.files.items ?? [];
          items.push(...pageItems);
          if (!data.torrent.files.hasNextPage || pageItems.length === 0) {
            break;
          }
        }
        if (!cancelled) {
          setFilesByInfoHash(groupFilesByInfoHash(items));
        }
      } catch (caught) {
        if (!cancelled) {
          setFilesByInfoHash({});
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [enabled, infoHashKey]);

  const groups = useMemo(
    () => (enabled ? buildEpisodeGroups(torrents, filesByInfoHash) : []),
    [enabled, filesByInfoHash, torrents]
  );

  return { groups, loading, error };
}

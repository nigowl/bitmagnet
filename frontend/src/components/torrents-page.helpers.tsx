import type { ReactNode } from "react";
import { resolveInternalHref } from "@/lib/navigation";
export { formatBytes } from "@/lib/format";
export { normalizeContentType as normalizeTorrentContentType } from "@/lib/media";
export { parseBooleanParam, parsePositiveIntParam } from "@/lib/url-params";

export type TorrentRow = {
  infoHash: string;
  contentType?: string | null;
  title: string;
  seeders?: number | null;
  leechers?: number | null;
  publishedAt?: string | null;
  torrent: {
    infoHash: string;
    name: string;
    size: number;
    filesCount?: number | null;
    singleFile?: boolean | null;
    fileType?: string | null;
    files?: Array<{ path: string }> | null;
    seeders?: number | null;
    leechers?: number | null;
    magnetUri?: string | null;
    sources: Array<{ key: string; name: string }>;
  };
  content?: {
    title?: string | null;
    overview?: string | null;
    releaseYear?: number | null;
  } | null;
};

export type SearchResult = {
  totalCount: number;
  hasNextPage?: boolean | null;
  items: TorrentRow[];
};

export type SearchResponse = {
  torrentContent: {
    search: SearchResult;
  };
};

export type TorrentFilesResponse = {
  torrent: {
    files: {
      items: Array<{
        index: number;
        path: string;
        size: number;
        fileType?: string | null;
      }>;
    };
  };
};

export function buildTorrentDetailHref(infoHash: string, sourceHref: string): string {
  const baseHref = `/torrents/${encodeURIComponent(infoHash)}`;
  const normalizedSource = resolveInternalHref(sourceHref, "");
  if (!normalizedSource) {
    return baseHref;
  }

  const params = new URLSearchParams();
  params.set("from", normalizedSource);
  return `${baseHref}?${params.toString()}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightSearchText(value: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;
  const terms = Array.from(new Set(normalizedQuery.split(/\s+/).map((term) => term.trim()).filter(Boolean))).slice(0, 6);
  if (terms.length === 0) return value;
  const matcher = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  const parts = value.split(matcher);
  return parts.map((part, index) =>
    terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? (
      <mark key={`${part}:${index}`} className="torrent-search-highlight">{part}</mark>
    ) : (
      part
    )
  );
}

import { cookies } from "next/headers";
import { formatBytes } from "@/lib/format";

const apiBaseURL = (process.env.BITMAGNET_INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BITMAGNET_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
const authTokenCookieKey = "bitmagnet-auth-token";

const TORRENT_SEO_QUERY = `
query TorrentSEO($input: TorrentContentSearchQueryInput!) {
  torrentContent {
    search(input: $input) {
      items {
        infoHash
        title
        seeders
        leechers
        videoResolution
        videoSource
        torrent {
          name
          size
          filesCount
          tagNames
          sources {
            name
          }
        }
        content {
          title
          overview
          releaseYear
          voteAverage
        }
      }
    }
  }
}
`;

type TorrentSEOItem = {
  infoHash: string;
  title?: string | null;
  seeders?: number | null;
  leechers?: number | null;
  videoResolution?: string | null;
  videoSource?: string | null;
  torrent?: {
    name?: string | null;
    size?: number | null;
    filesCount?: number | null;
    tagNames?: string[] | null;
    sources?: Array<{ name?: string | null }> | null;
  } | null;
  content?: {
    title?: string | null;
    overview?: string | null;
    releaseYear?: number | null;
    voteAverage?: number | null;
  } | null;
};

type GraphQLResponse = {
  data?: {
    torrentContent?: {
      search?: {
        items?: TorrentSEOItem[];
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

export type TorrentSEOInfo = {
  title: string;
  description: string;
  keywords: string[];
};

export async function fetchTorrentSEOInfo(infoHash: string): Promise<TorrentSEOInfo | null> {
  if (!infoHash) return null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(authTokenCookieKey)?.value?.trim();
    const response = await fetch(`${apiBaseURL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        query: TORRENT_SEO_QUERY,
        variables: { input: { infoHashes: [infoHash], limit: 1, page: 1 } }
      }),
      cache: "no-store"
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as GraphQLResponse;
    if (payload.errors?.length) return null;
    const item = payload.data?.torrentContent?.search?.items?.[0];
    return item ? buildTorrentSEOInfo(item, infoHash) : null;
  } catch {
    return null;
  }
}

function buildTorrentSEOInfo(item: TorrentSEOItem, infoHash: string): TorrentSEOInfo {
  const mediaTitle = clean(item.content?.title);
  const torrentName = clean(item.torrent?.name);
  const title = mediaTitle || clean(item.title) || torrentName || infoHash.slice(0, 10);
  const facts = [
    item.content?.releaseYear ? `${item.content.releaseYear}` : "",
    clean(item.videoResolution),
    clean(item.videoSource),
    item.content?.voteAverage ? `评分 ${item.content.voteAverage.toFixed(1)}` : "",
    item.seeders ? `做种 ${item.seeders}` : "",
    item.leechers ? `下载 ${item.leechers}` : "",
    item.torrent?.size ? formatBytes(item.torrent.size) : "",
    item.torrent?.filesCount ? `${item.torrent.filesCount} 个文件` : ""
  ].filter(Boolean);
  const overview = clean(item.content?.overview);
  const description = overview
    ? clamp(`${overview} ${facts.join(" / ")}`, 155)
    : clamp(`在线播放 ${title}。${facts.join(" / ")}${torrentName && torrentName !== title ? `。种子：${torrentName}` : ""}`, 155);

  return {
    title,
    description,
    keywords: uniqueStrings([
      title,
      mediaTitle,
      torrentName,
      clean(item.videoResolution),
      clean(item.videoSource),
      ...(item.torrent?.tagNames ?? []),
      ...(item.torrent?.sources ?? []).map((source) => clean(source.name))
    ])
  };
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clamp(value: string, max: number): string {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

import { apiRequest } from "@/lib/api";

export type MediaListItem = {
  id: string;
  contentType: string;
  title: string;
  nameOriginal?: string;
  nameEn?: string;
  nameZh?: string;
  overviewOriginal?: string;
  overviewEn?: string;
  overviewZh?: string;
  tagline?: string;
  statusText?: string;
  homepageUrl?: string;
  originalTitle?: string;
  overview?: string;
  releaseYear?: number;
  imdbId?: string;
  doubanId?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  voteCount?: number;
  genres: string[];
  languages: string[];
  productionCountries: string[];
  spokenLanguages: string[];
  premiereDates: string[];
  seasonCount?: number;
  episodeCount?: number;
  networkNames: string[];
  studioNames: string[];
  awardNames: string[];
  creatorNames: string[];
  titleAliases: string[];
  certification?: string;
  castMembers: string[];
  directorNames: string[];
  writerNames: string[];
  qualityTags: string[];
  collections: MediaDetailCollection[];
  attributes: MediaDetailAttribute[];
  isAnime: boolean;
  torrentCount: number;
  maxSeeders?: number;
  latestPublishedAt?: string;
  updatedAt: string;
};

export type MediaListResponse = {
  totalCount: number;
  totalTorrentCount: number;
  items: MediaListItem[];
};

export type MediaDetailLanguage = {
  id?: string;
  name: string;
};

export type MediaDetailCollection = {
  type: string;
  name: string;
};

export type MediaDetailAttribute = {
  source: string;
  key: string;
  value: string;
};

export type MediaSubtitleTemplate = {
  id: string;
  name: string;
  urlTemplate: string;
};

export type MediaDetailTorrent = {
  infoHash: string;
  title: string;
  seeders?: number;
  leechers?: number;
  size: number;
  filesCount?: number;
  videoResolution?: string;
  videoSource?: string;
  publishedAt: string;
  updatedAt: string;
  languages: MediaDetailLanguage[];
  torrent: {
    name: string;
    size: number;
    filesCount?: number;
    singleFile: boolean;
    fileType?: string;
    magnetUri: string;
    tagNames: string[];
    sources: Array<{ key: string; name: string }>;
  };
};

export type MediaDetailResponse = {
  item: {
    id: string;
    contentType: string;
    contentSource: string;
    contentId: string;
    title: string;
    nameOriginal?: string;
    nameEn?: string;
    nameZh?: string;
    overviewOriginal?: string;
    overviewEn?: string;
    overviewZh?: string;
    tagline?: string;
    statusText?: string;
    homepageUrl?: string;
    originalTitle?: string;
    originalLanguage?: string;
    releaseDate?: string;
    releaseYear?: number;
    overview?: string;
    runtime?: number;
    popularity?: number;
    voteAverage?: number;
    voteCount?: number;
    imdbId?: string;
    doubanId?: string;
    posterPath?: string;
    backdropPath?: string;
    genres: string[];
    productionCountries: string[];
    spokenLanguages: string[];
    premiereDates: string[];
    seasonCount?: number;
    episodeCount?: number;
    networkNames: string[];
    studioNames: string[];
    awardNames: string[];
    creatorNames: string[];
    titleAliases: string[];
    certification?: string;
    castMembers: string[];
    directorNames: string[];
    writerNames: string[];
    qualityTags: string[];
    isAnime: boolean;
    torrentCount: number;
    maxSeeders?: number;
    latestPublishedAt?: string;
    collections: MediaDetailCollection[];
    attributes: MediaDetailAttribute[];
    languages: MediaDetailLanguage[];
  };
  torrents: MediaDetailTorrent[];
  subtitleTemplates: MediaSubtitleTemplate[];
};

function normalizeStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeDetailLanguages(value: MediaDetailLanguage[] | null | undefined): MediaDetailLanguage[] {
  return Array.isArray(value) ? value : [];
}

function normalizeDetailCollections(value: MediaDetailCollection[] | null | undefined): MediaDetailCollection[] {
  return Array.isArray(value) ? value : [];
}

function normalizeDetailAttributes(value: MediaDetailAttribute[] | null | undefined): MediaDetailAttribute[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSubtitleTemplates(value: MediaSubtitleTemplate[] | null | undefined): MediaSubtitleTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : "",
      name: typeof item?.name === "string" ? item.name : "",
      urlTemplate: typeof item?.urlTemplate === "string" ? item.urlTemplate : ""
    }))
    .filter((item) => item.id && item.urlTemplate);
}

export async function fetchMediaList(params: {
  category?: "all" | "movie" | "series" | "anime";
  search?: string;
  quality?: string;
  year?: string;
  genre?: string;
  language?: string;
  country?: string;
  network?: string;
  studio?: string;
  awards?: string;
  sort?: string;
  limit?: number;
  page?: number;
}) {
  const query = new URLSearchParams();
  if (params.category && params.category !== "all") {
    query.set("category", params.category);
  }
  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }
  if (params.quality?.trim() && params.quality !== "all") {
    query.set("quality", params.quality.trim());
  }
  if (params.year?.trim() && params.year !== "all") {
    query.set("year", params.year.trim());
  }
  if (params.genre?.trim() && params.genre !== "all") {
    query.set("genre", params.genre.trim());
  }
  if (params.language?.trim() && params.language !== "all") {
    query.set("language", params.language.trim());
  }
  if (params.country?.trim() && params.country !== "all") {
    query.set("country", params.country.trim());
  }
  if (params.network?.trim() && params.network !== "all") {
    query.set("network", params.network.trim());
  }
  if (params.studio?.trim() && params.studio !== "all") {
    query.set("studio", params.studio.trim());
  }
  if (params.awards?.trim() && params.awards !== "all") {
    query.set("awards", params.awards.trim());
  }
  if (params.sort?.trim() && params.sort !== "latest") {
    query.set("sort", params.sort.trim());
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  if (params.page) {
    query.set("page", String(params.page));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiRequest<MediaListResponse>(`/api/media${suffix}`);

  return {
    totalCount: response.totalCount || 0,
    totalTorrentCount: response.totalTorrentCount || 0,
    items: Array.isArray(response.items)
      ? response.items.map((item) => ({
          ...item,
          genres: normalizeStringArray(item.genres),
          languages: normalizeStringArray(item.languages),
          productionCountries: normalizeStringArray((item as Partial<MediaListItem>).productionCountries),
          spokenLanguages: normalizeStringArray((item as Partial<MediaListItem>).spokenLanguages),
          premiereDates: normalizeStringArray((item as Partial<MediaListItem>).premiereDates),
          networkNames: normalizeStringArray((item as Partial<MediaListItem>).networkNames),
          studioNames: normalizeStringArray((item as Partial<MediaListItem>).studioNames),
          awardNames: normalizeStringArray((item as Partial<MediaListItem>).awardNames),
          creatorNames: normalizeStringArray((item as Partial<MediaListItem>).creatorNames),
          titleAliases: normalizeStringArray((item as Partial<MediaListItem>).titleAliases),
          castMembers: normalizeStringArray((item as Partial<MediaListItem>).castMembers),
          directorNames: normalizeStringArray((item as Partial<MediaListItem>).directorNames),
          writerNames: normalizeStringArray((item as Partial<MediaListItem>).writerNames),
          qualityTags: normalizeStringArray(item.qualityTags),
          collections: normalizeDetailCollections((item as Partial<MediaListItem>).collections),
          attributes: normalizeDetailAttributes((item as Partial<MediaListItem>).attributes)
        }))
      : []
  };
}

export async function fetchMediaDetail(id: string, options?: { refresh?: boolean }) {
  const query = new URLSearchParams();
  if (options?.refresh) {
    query.set("refresh", "1");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiRequest<MediaDetailResponse>(`/api/media/${encodeURIComponent(id)}${suffix}`);

  return {
    ...response,
    item: {
      ...response.item,
      genres: normalizeStringArray(response.item?.genres),
      productionCountries: normalizeStringArray(response.item?.productionCountries),
      spokenLanguages: normalizeStringArray(response.item?.spokenLanguages),
      premiereDates: normalizeStringArray(response.item?.premiereDates),
      networkNames: normalizeStringArray(response.item?.networkNames),
      studioNames: normalizeStringArray(response.item?.studioNames),
      awardNames: normalizeStringArray(response.item?.awardNames),
      creatorNames: normalizeStringArray(response.item?.creatorNames),
      titleAliases: normalizeStringArray(response.item?.titleAliases),
      castMembers: normalizeStringArray(response.item?.castMembers),
      directorNames: normalizeStringArray(response.item?.directorNames),
      writerNames: normalizeStringArray(response.item?.writerNames),
      qualityTags: normalizeStringArray(response.item?.qualityTags),
      collections: normalizeDetailCollections(response.item?.collections),
      attributes: normalizeDetailAttributes(response.item?.attributes),
      languages: normalizeDetailLanguages(response.item?.languages)
    },
    subtitleTemplates: normalizeSubtitleTemplates(response.subtitleTemplates),
    torrents: Array.isArray(response.torrents)
      ? response.torrents.map((torrent) => ({
          ...torrent,
          languages: normalizeDetailLanguages(torrent.languages),
          torrent: {
            ...torrent.torrent,
            tagNames: normalizeStringArray(torrent.torrent?.tagNames),
            sources: Array.isArray(torrent.torrent?.sources) ? torrent.torrent.sources : []
          }
        }))
      : []
  };
}

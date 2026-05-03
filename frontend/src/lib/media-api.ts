import { apiBaseURL, apiRequest } from "@/lib/api";

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
  hasCache?: boolean;
  cacheUpdatedAt?: string;
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
  playerEnabled: boolean;
};

export type PlayerTransmissionFile = {
  index: number;
  name: string;
  length: number;
  bytesCompleted: number;
  wanted: boolean;
  priority: number;
  isVideo: boolean;
};

export type PlayerTransmissionStatusResponse = {
  infoHash: string;
  torrentId: number;
  name: string;
  state: string;
  progress: number;
  downloadRate: number;
  uploadRate: number;
  peersConnected: number;
  errorCode: number;
  errorMessage: string;
  selectedFileIndex: number;
  selectedFileBytesCompleted: number;
  selectedFileLength: number;
  selectedFileDurationSeconds: number;
  selectedFileReadyRatio: number;
  selectedFileContiguousBytes: number;
  selectedFileContiguousRatio: number;
  selectedFileAvailableRanges: Array<{
    startRatio: number;
    endRatio: number;
  }>;
  sequentialDownload: boolean;
  files: PlayerTransmissionFile[];
  updatedAt: string;
};

export type PlayerTransmissionTaskStatus = {
  infoHash: string;
  exists: boolean;
  torrentId: number;
  state: string;
  progress: number;
};

export type PlayerTransmissionBatchStatusResponse = {
  items: PlayerTransmissionTaskStatus[];
};

export type PlayerTransmissionClearCacheResponse = {
  removed: number;
};

export type PlayerTransmissionBootstrapResponse = {
  infoHash: string;
  torrentId: number;
  selectedFileIndex: number;
  streamUrl: string;
  transcodeEnabled: boolean;
  status: PlayerTransmissionStatusResponse;
};

export type PlayerTransmissionSelectFileResponse = {
  infoHash: string;
  selectedFileIndex: number;
  streamUrl: string;
  transcodeEnabled: boolean;
  status: PlayerTransmissionStatusResponse;
};

export type PlayerTransmissionAudioTrack = {
  index: number;
  streamIndex: number;
  label: string;
  language: string;
  codec: string;
  channels: number;
  default: boolean;
};

export type PlayerTransmissionAudioTracksResponse = {
  infoHash: string;
  fileIndex: number;
  tracks: PlayerTransmissionAudioTrack[];
};

export type PlayerSubtitleItem = {
  id: number;
  infoHash: string;
  label: string;
  language: string;
  offsetSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type PlayerSubtitleListResponse = {
  items: PlayerSubtitleItem[];
};

export type PlayerSubtitleSingleResponse = {
  item: PlayerSubtitleItem;
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
  cache?: string;
  sort?: string;
  heatDays?: number;
  scoreMin?: number;
  scoreMax?: number;
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
  if (params.cache?.trim() && params.cache !== "all") {
    query.set("cache", params.cache.trim());
  }
  if (params.sort?.trim() && params.sort !== "latest") {
    query.set("sort", params.sort.trim());
  }
  if (typeof params.heatDays === "number" && Number.isFinite(params.heatDays) && params.heatDays > 0) {
    query.set("heatDays", String(Math.round(params.heatDays)));
  }
  if (typeof params.scoreMin === "number" && Number.isFinite(params.scoreMin)) {
    query.set("scoreMin", String(params.scoreMin));
  }
  if (typeof params.scoreMax === "number" && Number.isFinite(params.scoreMax)) {
    query.set("scoreMax", String(params.scoreMax));
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
    playerEnabled: typeof response.playerEnabled === "boolean" ? response.playerEnabled : true,
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

export async function fetchPlayerTransmissionBootstrap(infoHash: string): Promise<PlayerTransmissionBootstrapResponse> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  return apiRequest<PlayerTransmissionBootstrapResponse>("/api/media/player/transmission/bootstrap", {
    method: "POST",
    data: { infoHash: normalized }
  });
}

export async function fetchPlayerTransmissionStatus(infoHash: string): Promise<PlayerTransmissionStatusResponse> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  const query = new URLSearchParams({ infoHash: normalized });
  return apiRequest<PlayerTransmissionStatusResponse>(`/api/media/player/transmission/status?${query.toString()}`);
}

export async function fetchPlayerTransmissionBatchStatus(
  infoHashes: string[]
): Promise<PlayerTransmissionBatchStatusResponse> {
  const normalized = Array.from(
    new Set(infoHashes.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0))
  );
  if (normalized.length === 0) {
    return { items: [] };
  }
  const query = new URLSearchParams();
  normalized.forEach((item) => query.append("infoHash", item));
  return apiRequest<PlayerTransmissionBatchStatusResponse>(
    `/api/media/player/transmission/status/batch?${query.toString()}`
  );
}

export async function clearPlayerTransmissionCache(infoHashes: string[]): Promise<PlayerTransmissionClearCacheResponse> {
  const normalized = Array.from(
    new Set(infoHashes.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0))
  );
  if (normalized.length === 0) {
    return { removed: 0 };
  }
  return apiRequest<PlayerTransmissionClearCacheResponse>("/api/media/player/transmission/cache", {
    method: "DELETE",
    data: { infoHashes: normalized }
  });
}

export async function selectPlayerTransmissionFile(
  infoHash: string,
  fileIndex: number
): Promise<PlayerTransmissionSelectFileResponse> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  return apiRequest<PlayerTransmissionSelectFileResponse>("/api/media/player/transmission/select-file", {
    method: "POST",
    data: { infoHash: normalized, fileIndex }
  });
}

export async function fetchPlayerTransmissionAudioTracks(
  infoHash: string,
  fileIndex: number
): Promise<PlayerTransmissionAudioTrack[]> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  if (!Number.isInteger(fileIndex) || fileIndex < 0) {
    throw new Error("Invalid fileIndex.");
  }
  const query = new URLSearchParams({
    infoHash: normalized,
    fileIndex: String(fileIndex)
  });
  const result = await apiRequest<PlayerTransmissionAudioTracksResponse>(
    `/api/media/player/transmission/audio-tracks?${query.toString()}`
  );
  return Array.isArray(result.tracks) ? result.tracks : [];
}

export function buildPlayerTransmissionStreamURL(
  infoHash: string,
  fileIndex: number,
  cacheBust?: string,
  options?: { transcode?: boolean; startSeconds?: number; startBytes?: number; audioTrackIndex?: number; outputResolution?: number }
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase(),
    fileIndex: String(fileIndex)
  });
  if (cacheBust) {
    query.set("t", cacheBust);
  }
  if (options?.transcode) {
    query.set("transcode", "1");
    if (Number.isFinite(options.startSeconds) && (options.startSeconds || 0) > 0) {
      query.set("start", String(Math.max(0, options.startSeconds || 0)));
    }
    if (Number.isFinite(options.startBytes) && (options.startBytes || 0) > 0) {
      query.set("startBytes", String(Math.max(0, Math.floor(options.startBytes || 0))));
    }
    if (Number.isInteger(options.audioTrackIndex) && (options.audioTrackIndex || -1) >= 0) {
      query.set("audioTrack", String(Math.max(0, Math.floor(options.audioTrackIndex || 0))));
    }
    if (Number.isInteger(options.outputResolution) && (options.outputResolution || 0) > 0) {
      query.set("resolution", String(Math.max(1, Math.floor(options.outputResolution || 0))));
    }
  }
  return `${apiBaseURL}/api/media/player/transmission/stream?${query.toString()}`;
}

export function buildPlayerTransmissionHLSPlaylistURL(
  infoHash: string,
  fileIndex: number,
  cacheBust?: string,
  options?: { startSeconds?: number; startBytes?: number; audioTrackIndex?: number; outputResolution?: number; prebufferSeconds?: number }
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase(),
    fileIndex: String(fileIndex)
  });
  if (cacheBust) {
    query.set("t", cacheBust);
  }
  if (Number.isFinite(options?.startSeconds) && (options?.startSeconds || 0) > 0) {
    query.set("start", String(Math.max(0, options?.startSeconds || 0)));
  }
  if (Number.isFinite(options?.startBytes) && (options?.startBytes || 0) > 0) {
    query.set("startBytes", String(Math.max(0, Math.floor(options?.startBytes || 0))));
  }
  if (Number.isInteger(options?.audioTrackIndex) && (options?.audioTrackIndex || -1) >= 0) {
    query.set("audioTrack", String(Math.max(0, Math.floor(options?.audioTrackIndex || 0))));
  }
  if (Number.isInteger(options?.outputResolution) && (options?.outputResolution || 0) > 0) {
    query.set("resolution", String(Math.max(1, Math.floor(options?.outputResolution || 0))));
  }
  if (Number.isFinite(options?.prebufferSeconds) && (options?.prebufferSeconds || 0) > 0) {
    query.set("prebuffer", String(Math.max(10, Math.floor(options?.prebufferSeconds || 0))));
  }
  return `${apiBaseURL}/api/media/player/transmission/hls/playlist?${query.toString()}`;
}

export function buildPlayerTransmissionHLSStopURL(
  infoHash: string,
  fileIndex: number,
  options?: { audioTrackIndex?: number; outputResolution?: number }
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase(),
    fileIndex: String(fileIndex)
  });
  if (Number.isInteger(options?.audioTrackIndex) && (options?.audioTrackIndex || -1) >= 0) {
    query.set("audioTrack", String(Math.max(0, Math.floor(options?.audioTrackIndex || 0))));
  }
  if (Number.isInteger(options?.outputResolution) && (options?.outputResolution || 0) > 0) {
    query.set("resolution", String(Math.max(1, Math.floor(options?.outputResolution || 0))));
  }
  return `${apiBaseURL}/api/media/player/transmission/hls/stop?${query.toString()}`;
}

export function buildPlayerTransmissionHLSHeartbeatURL(
  infoHash: string,
  fileIndex: number,
  options?: { audioTrackIndex?: number; outputResolution?: number }
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase(),
    fileIndex: String(fileIndex)
  });
  if (Number.isInteger(options?.audioTrackIndex) && (options?.audioTrackIndex || -1) >= 0) {
    query.set("audioTrack", String(Math.max(0, Math.floor(options?.audioTrackIndex || 0))));
  }
  if (Number.isInteger(options?.outputResolution) && (options?.outputResolution || 0) > 0) {
    query.set("resolution", String(Math.max(1, Math.floor(options?.outputResolution || 0))));
  }
  return `${apiBaseURL}/api/media/player/transmission/hls/heartbeat?${query.toString()}`;
}

export function buildPlayerTransmissionThumbnailURL(
  infoHash: string,
  fileIndex: number,
  seconds: number,
  cacheBust?: string,
  options?: { startBytes?: number }
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase(),
    fileIndex: String(fileIndex),
    seconds: String(Math.max(0, Number.isFinite(seconds) ? seconds : 0))
  });
  if (cacheBust) {
    query.set("t", cacheBust);
  }
  if (Number.isFinite(options?.startBytes) && (options?.startBytes || 0) > 0) {
    query.set("startBytes", String(Math.max(0, Math.floor(options?.startBytes || 0))));
  }
  return `${apiBaseURL}/api/media/player/transmission/thumbnail?${query.toString()}`;
}

export function buildPlayerSubtitleContentURL(
  infoHash: string,
  subtitleId: number | string,
  cacheBust?: string
): string {
  const query = new URLSearchParams({
    infoHash: infoHash.trim().toLowerCase()
  });
  if (cacheBust) {
    query.set("t", cacheBust);
  }
  return `${apiBaseURL}/api/media/player/subtitles/${encodeURIComponent(String(subtitleId))}/content?${query.toString()}`;
}

export async function fetchPlayerSubtitles(infoHash: string): Promise<PlayerSubtitleItem[]> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  const query = new URLSearchParams({ infoHash: normalized });
  const result = await apiRequest<PlayerSubtitleListResponse>(`/api/media/player/subtitles?${query.toString()}`);
  return Array.isArray(result.items) ? result.items : [];
}

export async function fetchPlayerSubtitleContent(infoHash: string, subtitleId: number): Promise<string> {
  const normalized = infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  if (!Number.isInteger(subtitleId) || subtitleId <= 0) {
    throw new Error("Invalid subtitleId.");
  }
  const query = new URLSearchParams({ infoHash: normalized });
  return apiRequest<string>(
    `/api/media/player/subtitles/${encodeURIComponent(String(subtitleId))}/content?${query.toString()}`
  );
}

export async function createPlayerSubtitle(input: {
  infoHash: string;
  label: string;
  language?: string;
  contentVtt: string;
}): Promise<PlayerSubtitleItem> {
  const normalized = input.infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  const response = await apiRequest<PlayerSubtitleSingleResponse>("/api/media/player/subtitles", {
    method: "POST",
    data: {
      infoHash: normalized,
      label: input.label,
      language: input.language || "und",
      contentVtt: input.contentVtt
    }
  });
  return response.item;
}

export async function updatePlayerSubtitle(input: {
  infoHash: string;
  subtitleId: number;
  label?: string;
  language?: string;
  offsetSeconds?: number;
}): Promise<PlayerSubtitleItem> {
  const normalized = input.infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  const response = await apiRequest<PlayerSubtitleSingleResponse>(
    `/api/media/player/subtitles/${encodeURIComponent(String(input.subtitleId))}`,
    {
      method: "PUT",
      data: {
        infoHash: normalized,
        label: input.label,
        language: input.language,
        offsetSeconds: input.offsetSeconds
      }
    }
  );
  return response.item;
}

export async function deletePlayerSubtitle(input: { infoHash: string; subtitleId: number }): Promise<void> {
  const normalized = input.infoHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Missing infoHash.");
  }
  const query = new URLSearchParams({ infoHash: normalized });
  await apiRequest(`/api/media/player/subtitles/${encodeURIComponent(String(input.subtitleId))}?${query.toString()}`, {
    method: "DELETE"
  });
}

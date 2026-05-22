import { apiBaseURL, apiRequest } from "@/lib/api";

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
  options?: { startSeconds?: number; startBytes?: number; audioTrackIndex?: number; outputResolution?: number; prebufferSeconds?: number; durationSeconds?: number }
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
  if (Number.isFinite(options?.durationSeconds) && (options?.durationSeconds || 0) > 0) {
    query.set("duration", String(Math.max(0, options?.durationSeconds || 0)));
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

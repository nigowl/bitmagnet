import type { SystemSettings } from "./settings-page.types";
import {
  DEFAULT_AUTH_SETTINGS,
  DEFAULT_DHT_SCHEDULE,
  DEFAULT_HOME_SETTINGS,
  DEFAULT_PLAYER_SETTINGS
} from "./settings-page.defaults";

export function parseYear(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const year = Number(trimmed);
  if (!Number.isFinite(year) || year <= 0) return undefined;
  return Math.trunc(year);
}

export function normalizeVideoFormatTags(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    let item = String(raw || "").trim().toLowerCase();
    if (!item) continue;
    item = item.replace(/^[*]+/, "");
    if (!item.startsWith(".")) {
      item = `.${item}`;
    }
    if (!/^\.[a-z0-9._-]{1,15}$/.test(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  result.sort();
  return result;
}

export function areSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatGiBFromBytes(bytes?: number): string {
  if (!Number.isFinite(bytes) || Number(bytes) < 0) return "-";
  const gib = Number(bytes) / (1024 * 1024 * 1024);
  if (!Number.isFinite(gib)) return "-";
  return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`;
}

export function createDefaultSystemSettings(): SystemSettings {
  return {
    tmdbEnabled: true,
    imdbEnabled: true,
    doubanEnabled: true,
    doubanMinScore: 0.62,
    doubanCookie: "",
    doubanUserAgent: "",
    doubanAcceptLanguage: "",
    doubanReferer: "",
    performance: {
      dht: {
        scalingFactor: 10,
        reseedIntervalSeconds: 60,
        saveFilesThreshold: 100,
        savePieces: false,
        rescrapeThresholdHours: 24 * 30,
        statusLogIntervalSeconds: 45,
        getOldestNodesIntervalSeconds: 10,
        oldPeerThresholdMinutes: 15,
        ...DEFAULT_DHT_SCHEDULE
      },
      queue: {
        processTorrentConcurrency: 1,
        processTorrentCheckIntervalSeconds: 30,
        processTorrentTimeoutSeconds: 10 * 60,
        processTorrentBatchConcurrency: 1,
        processTorrentBatchCheckIntervalSeconds: 30,
        processTorrentBatchTimeoutSeconds: 10 * 60,
        refreshMediaMetadataConcurrency: 1,
        refreshMediaMetadataCheckIntervalSeconds: 30,
        refreshMediaMetadataTimeoutSeconds: 20 * 60,
        backfillCoverCacheConcurrency: 1,
        backfillCoverCacheCheckIntervalSeconds: 30,
        backfillCoverCacheTimeoutSeconds: 20 * 60
      },
      media: {
        autoCacheCover: true,
        autoFetchBilingual: true,
        warmupTimeoutSeconds: 90
      }
    },
    home: {
      ...DEFAULT_HOME_SETTINGS
    },
    player: { ...DEFAULT_PLAYER_SETTINGS },
    auth: { ...DEFAULT_AUTH_SETTINGS }
  };
}

export function normalizeSystemSettings(input: SystemSettings, playerEnabledFallback: boolean): SystemSettings {
  const playerEnabled = typeof input.player?.enabled === "boolean" ? input.player.enabled : playerEnabledFallback;
  return {
    ...input,
    player: {
      ...DEFAULT_PLAYER_SETTINGS,
      ...input.player,
      enabled: playerEnabled,
      transmission: {
        ...DEFAULT_PLAYER_SETTINGS.transmission,
        ...input.player?.transmission,
        enabled: playerEnabled,
        downloadVideoFormats: normalizeVideoFormatTags(
          input.player?.transmission?.downloadVideoFormats ?? DEFAULT_PLAYER_SETTINGS.transmission.downloadVideoFormats
        ),
        downloadMappingDirectory:
          input.player?.transmission?.downloadMappingDirectory ??
          input.player?.transmission?.localDownloadDir ??
          DEFAULT_PLAYER_SETTINGS.transmission.downloadMappingDirectory,
        localDownloadDir:
          input.player?.transmission?.localDownloadDir ??
          input.player?.transmission?.downloadMappingDirectory ??
          DEFAULT_PLAYER_SETTINGS.transmission.localDownloadDir
      },
      ffmpeg: {
        ...DEFAULT_PLAYER_SETTINGS.ffmpeg,
        ...input.player?.ffmpeg,
        enabled: playerEnabled
      }
    },
    auth: {
      ...DEFAULT_AUTH_SETTINGS,
      ...input.auth
    },
    home: {
      ...DEFAULT_HOME_SETTINGS,
      ...input.home,
      daily: {
        ...DEFAULT_HOME_SETTINGS.daily,
        ...input.home?.daily
      },
      hot: {
        ...DEFAULT_HOME_SETTINGS.hot,
        ...input.home?.hot
      },
      highScore: {
        ...DEFAULT_HOME_SETTINGS.highScore,
        ...input.home?.highScore
      }
    }
  };
}

export function buildSettingsUpdatePayload(current: SystemSettings, baseline: SystemSettings | null): Record<string, unknown> {
  if (!baseline) {
    return {
      tmdbEnabled: current.tmdbEnabled,
      imdbEnabled: current.imdbEnabled,
      doubanEnabled: current.doubanEnabled,
      doubanMinScore: current.doubanMinScore,
      doubanCookie: current.doubanCookie,
      doubanUserAgent: current.doubanUserAgent,
      doubanAcceptLanguage: current.doubanAcceptLanguage,
      doubanReferer: current.doubanReferer,
      performance: current.performance,
      home: current.home,
      player: current.player,
      auth: current.auth
    };
  }

  const payload: Record<string, unknown> = {};
  if (current.tmdbEnabled !== baseline.tmdbEnabled) payload.tmdbEnabled = current.tmdbEnabled;
  if (current.imdbEnabled !== baseline.imdbEnabled) payload.imdbEnabled = current.imdbEnabled;
  if (current.doubanEnabled !== baseline.doubanEnabled) payload.doubanEnabled = current.doubanEnabled;
  if (current.doubanMinScore !== baseline.doubanMinScore) payload.doubanMinScore = current.doubanMinScore;
  if (current.doubanCookie !== baseline.doubanCookie) payload.doubanCookie = current.doubanCookie;
  if (current.doubanUserAgent !== baseline.doubanUserAgent) payload.doubanUserAgent = current.doubanUserAgent;
  if (current.doubanAcceptLanguage !== baseline.doubanAcceptLanguage) payload.doubanAcceptLanguage = current.doubanAcceptLanguage;
  if (current.doubanReferer !== baseline.doubanReferer) payload.doubanReferer = current.doubanReferer;
  if (!areSameValue(current.performance, baseline.performance)) payload.performance = current.performance;
  if (!areSameValue(current.home, baseline.home)) payload.home = current.home;
  if (!areSameValue(current.player, baseline.player)) payload.player = current.player;
  if (!areSameValue(current.auth, baseline.auth)) payload.auth = current.auth;
  return payload;
}

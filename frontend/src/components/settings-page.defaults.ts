import type { SystemSettings } from "./settings-page.types";

export type PerformancePresetKey = "resource" | "realtime" | "throughput";

export const DEFAULT_DHT_SCHEDULE = {
  scheduleEnabled: false,
  scheduleWeekdays: [1, 2, 3, 4, 5, 6, 7],
  scheduleStartHour: 0,
  scheduleEndHour: 24
};

export const PERFORMANCE_PRESETS: Record<PerformancePresetKey, SystemSettings["performance"]> = {
  resource: {
    dht: {
      scalingFactor: 4,
      reseedIntervalSeconds: 120,
      saveFilesThreshold: 80,
      savePieces: false,
      rescrapeThresholdHours: 24 * 30,
      statusLogIntervalSeconds: 90,
      getOldestNodesIntervalSeconds: 20,
      oldPeerThresholdMinutes: 20,
      ...DEFAULT_DHT_SCHEDULE
    },
    queue: {
      processTorrentConcurrency: 1,
      processTorrentCheckIntervalSeconds: 45,
      processTorrentTimeoutSeconds: 10 * 60,
      processTorrentBatchConcurrency: 1,
      processTorrentBatchCheckIntervalSeconds: 45,
      processTorrentBatchTimeoutSeconds: 10 * 60,
      refreshMediaMetadataConcurrency: 1,
      refreshMediaMetadataCheckIntervalSeconds: 45,
      refreshMediaMetadataTimeoutSeconds: 20 * 60,
      backfillCoverCacheConcurrency: 1,
      backfillCoverCacheCheckIntervalSeconds: 45,
      backfillCoverCacheTimeoutSeconds: 20 * 60
    },
    media: {
      autoCacheCover: false,
      autoFetchBilingual: false,
      warmupTimeoutSeconds: 120
    }
  },
  realtime: {
    dht: {
      scalingFactor: 8,
      reseedIntervalSeconds: 30,
      saveFilesThreshold: 100,
      savePieces: false,
      rescrapeThresholdHours: 24 * 7,
      statusLogIntervalSeconds: 30,
      getOldestNodesIntervalSeconds: 6,
      oldPeerThresholdMinutes: 10,
      ...DEFAULT_DHT_SCHEDULE
    },
    queue: {
      processTorrentConcurrency: 2,
      processTorrentCheckIntervalSeconds: 8,
      processTorrentTimeoutSeconds: 10 * 60,
      processTorrentBatchConcurrency: 1,
      processTorrentBatchCheckIntervalSeconds: 10,
      processTorrentBatchTimeoutSeconds: 10 * 60,
      refreshMediaMetadataConcurrency: 2,
      refreshMediaMetadataCheckIntervalSeconds: 10,
      refreshMediaMetadataTimeoutSeconds: 20 * 60,
      backfillCoverCacheConcurrency: 2,
      backfillCoverCacheCheckIntervalSeconds: 10,
      backfillCoverCacheTimeoutSeconds: 20 * 60
    },
    media: {
      autoCacheCover: true,
      autoFetchBilingual: true,
      warmupTimeoutSeconds: 90
    }
  },
  throughput: {
    dht: {
      scalingFactor: 20,
      reseedIntervalSeconds: 30,
      saveFilesThreshold: 300,
      savePieces: false,
      rescrapeThresholdHours: 24 * 7,
      statusLogIntervalSeconds: 30,
      getOldestNodesIntervalSeconds: 5,
      oldPeerThresholdMinutes: 10,
      ...DEFAULT_DHT_SCHEDULE
    },
    queue: {
      processTorrentConcurrency: 4,
      processTorrentCheckIntervalSeconds: 10,
      processTorrentTimeoutSeconds: 15 * 60,
      processTorrentBatchConcurrency: 3,
      processTorrentBatchCheckIntervalSeconds: 10,
      processTorrentBatchTimeoutSeconds: 15 * 60,
      refreshMediaMetadataConcurrency: 3,
      refreshMediaMetadataCheckIntervalSeconds: 15,
      refreshMediaMetadataTimeoutSeconds: 30 * 60,
      backfillCoverCacheConcurrency: 2,
      backfillCoverCacheCheckIntervalSeconds: 15,
      backfillCoverCacheTimeoutSeconds: 30 * 60
    },
    media: {
      autoCacheCover: true,
      autoFetchBilingual: true,
      warmupTimeoutSeconds: 150
    }
  }
};

export const DEFAULT_PLAYER_SETTINGS: SystemSettings["player"] = {
  enabled: true,
  metadataTimeoutSeconds: 25,
  hardTimeoutSeconds: 45,
  transmission: {
    enabled: true,
    url: "http://127.0.0.1:9091/transmission/rpc",
    localDownloadDir: "",
    downloadMappingDirectory: "",
    downloadVideoFormats: [
      ".mp4",
      ".m4v",
      ".webm",
      ".mkv",
      ".mov",
      ".avi",
      ".flv",
      ".ts",
      ".m2ts",
      ".mpeg",
      ".mpg",
      ".wmv",
      ".asf",
      ".3gp",
      ".3g2",
      ".f4v",
      ".rm",
      ".rmvb",
      ".vob",
      ".mxf",
      ".divx",
      ".xvid"
    ],
    username: "",
    password: "",
    insecureTls: false,
    timeoutSeconds: 8,
    sequentialDownload: true,
    cacheQueueEnabled: true,
    cacheQueueMaxActive: 3,
    cacheQueueCheckIntervalSeconds: 15,
    autoCleanupEnabled: false,
    autoCleanupSlowTaskEnabled: true,
    autoCleanupStorageEnabled: true,
    autoCleanupMaxTasks: 60,
    autoCleanupMaxTotalSizeGB: 100,
    autoCleanupMinFreeSpaceGB: 20,
    autoCleanupSlowWindowMinutes: 30,
    autoCleanupSlowRateKbps: 100
  },
  ffmpeg: {
    enabled: true,
    binaryPath: "ffmpeg",
    preset: "veryfast",
    crf: 21,
    audioBitrateKbps: 192,
    threads: 0,
    extraArgs: ""
  }
};

export const DEFAULT_AUTH_SETTINGS: SystemSettings["auth"] = {
  membershipEnabled: false,
  registrationEnabled: true,
  inviteRequired: false
};

export const DEFAULT_HOME_SETTINGS: SystemSettings["home"] = {
  daily: {
    refreshHour: 2,
    poolLimit: 96
  },
  hot: {
    days: 30
  },
  highScore: {
    poolLimit: 120,
    minScore: 8,
    maxScore: 9.9,
    window: 1
  }
};

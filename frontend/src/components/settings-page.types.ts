export type SystemSettings = {
  tmdbEnabled: boolean;
  imdbEnabled: boolean;
  doubanEnabled: boolean;
  doubanMinScore: number;
  doubanCookie: string;
  doubanUserAgent: string;
  doubanAcceptLanguage: string;
  doubanReferer: string;
  performance: {
    dht: {
      scalingFactor: number;
      reseedIntervalSeconds: number;
      saveFilesThreshold: number;
      savePieces: boolean;
      rescrapeThresholdHours: number;
      statusLogIntervalSeconds: number;
      getOldestNodesIntervalSeconds: number;
      oldPeerThresholdMinutes: number;
      scheduleEnabled: boolean;
      scheduleWeekdays: number[];
      scheduleStartHour: number;
      scheduleEndHour: number;
    };
    queue: {
      processTorrentConcurrency: number;
      processTorrentCheckIntervalSeconds: number;
      processTorrentTimeoutSeconds: number;
      processTorrentBatchConcurrency: number;
      processTorrentBatchCheckIntervalSeconds: number;
      processTorrentBatchTimeoutSeconds: number;
      refreshMediaMetadataConcurrency: number;
      refreshMediaMetadataCheckIntervalSeconds: number;
      refreshMediaMetadataTimeoutSeconds: number;
      backfillCoverCacheConcurrency: number;
      backfillCoverCacheCheckIntervalSeconds: number;
      backfillCoverCacheTimeoutSeconds: number;
    };
    media: {
      autoCacheCover: boolean;
      autoFetchBilingual: boolean;
      warmupTimeoutSeconds: number;
    };
  };
  home: {
    daily: {
      refreshHour: number;
      poolLimit: number;
    };
    hot: {
      days: number;
    };
    highScore: {
      poolLimit: number;
      minScore: number;
      maxScore: number;
      window: number;
    };
  };
  player: {
    enabled: boolean;
    metadataTimeoutSeconds: number;
    hardTimeoutSeconds: number;
    transmission: {
      enabled: boolean;
      url: string;
      localDownloadDir: string;
      downloadMappingDirectory: string;
      downloadVideoFormats: string[];
      username: string;
      password: string;
      insecureTls: boolean;
      timeoutSeconds: number;
      sequentialDownload: boolean;
      autoCleanupEnabled: boolean;
      autoCleanupSlowTaskEnabled: boolean;
      autoCleanupStorageEnabled: boolean;
      autoCleanupMaxTasks: number;
      autoCleanupMaxTotalSizeGB: number;
      autoCleanupMinFreeSpaceGB: number;
      autoCleanupSlowWindowMinutes: number;
      autoCleanupSlowRateKbps: number;
    };
    ffmpeg: {
      enabled: boolean;
      binaryPath: string;
      preset: string;
      crf: number;
      audioBitrateKbps: number;
      threads: number;
      extraArgs: string;
    };
  };
  auth: {
    membershipEnabled: boolean;
    registrationEnabled: boolean;
    inviteRequired: boolean;
  };
};

export type SettingsResponse = {
  settings: SystemSettings;
};

export type RuntimeSettingStatus = {
  key: string;
  value: string;
  source: "runtime" | "default";
};

export type WorkerRuntimeStatus = {
  key: string;
  enabled: boolean;
  started: boolean;
};

export type RuntimeStatus = {
  checkedAt: string;
  settings: RuntimeSettingStatus[];
  workers: WorkerRuntimeStatus[];
};

export type RuntimeStatusResponse = {
  status: RuntimeStatus;
};

export type WorkerRestartResponse = {
  ok: boolean;
  report?: {
    elapsed?: string | number;
    workers?: Array<{
      key?: string;
      phases?: Array<{
        name?: string;
        status?: string;
        elapsed?: string | number;
      }>;
    }>;
  };
};

export type PluginTestResult = {
  plugin: string;
  success: boolean;
  message: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs?: string[];
};

export type PluginTestResponse = {
  result: PluginTestResult;
};

export type SubtitleTemplate = {
  id: string;
  name: string;
  urlTemplate: string;
  enabled: boolean;
};

export type SubtitleTemplatesResponse = {
  templates: SubtitleTemplate[];
};

export type SubtitleTemplateResponse = {
  template: SubtitleTemplate;
};

export type SubtitleTemplateForm = {
  name: string;
  urlTemplate: string;
  enabled: boolean;
};

export type PluginInputs = {
  tmdb: { query: string; contentType: string; year: string };
  imdb: { imdbId: string };
  douban: { title: string; contentType: string; year: string };
};

export type TransmissionConnectivityResult = {
  success: boolean;
  message: string;
  url: string;
  latencyMs: number;
  rpcVersion: number;
  rpcVersionMin: number;
  version: string;
  downloadDir: string;
  localDownloadDir?: string;
  localDownloadDirExists?: boolean;
  localDownloadDirIsDir?: boolean;
  localDownloadDirReadable?: boolean;
  localDownloadDirEntries?: number;
  localDownloadDirError?: string;
  downloadMapping?: DownloadMappingConnectivityResult;
};

export type TransmissionConnectivityResponse = {
  result: TransmissionConnectivityResult;
};

export type DownloadMappingConnectivityResult = {
  success: boolean;
  message: string;
  mode: "directory";
  latencyMs: number;
  directory?: string;
  directoryExists?: boolean;
  directoryIsDir?: boolean;
  directoryReadable?: boolean;
  directoryEntries?: number;
  directoryError?: string;
};

export type DownloadMappingConnectivityResponse = {
  result: DownloadMappingConnectivityResult;
};

export type TransmissionTaskStats = {
  taskCount: number;
  totalSizeBytes: number;
  freeSpaceBytes: number;
  freeSpaceAvailable: boolean;
};

export type TransmissionTaskStatsResponse = {
  stats: TransmissionTaskStats;
};

export type FFmpegConnectivityResult = {
  success: boolean;
  message: string;
  binaryPath: string;
  latencyMs: number;
  version: string;
  argsPreview: string;
  encodeMode: string;
};

export type FFmpegConnectivityResponse = {
  result: FFmpegConnectivityResult;
};

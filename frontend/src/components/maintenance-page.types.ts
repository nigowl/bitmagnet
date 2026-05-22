export type MaintenanceTaskType = "fix_localized_metadata" | "fix_cover_cache";
export type MaintenanceTaskStatus = "pending" | "running" | "success" | "failed";

export type MaintenanceTask = {
  id: string;
  type: MaintenanceTaskType;
  limit: number;
  status: MaintenanceTaskStatus;
  requested: number;
  processed: number;
  updated: number;
  remaining: number;
  failed: number;
  message?: string;
  error?: string;
  logs?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

export type StartMaintenanceResponse = {
  task: MaintenanceTask;
};

export type TaskStatusResponse = {
  task: MaintenanceTask;
};

export type MaintenanceStatsResponse = {
  stats: {
    type: MaintenanceTaskType;
    pending: number;
  };
};

export type TransmissionTaskItem = {
  id: number;
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  leftUntilDone: number;
  sizeWhenDone: number;
  addedAtUnix: number;
  activityAtUnix: number;
  isFinished: boolean;
  downloadDir: string;
  errorString: string;
};

export type TransmissionTasksResponse = {
  tasks: TransmissionTaskItem[];
};

export type TransmissionCleanupResponse = {
  result: {
    success: boolean;
    totalBefore: number;
    removedCount: number;
    removedIds: number[];
    reasons: string[];
    estimatedFreeGain: number;
  };
};

export type TransmissionDeleteTaskResponse = {
  result: {
    success: boolean;
    id: number;
  };
};

export type AdminSettingsResponse = {
  settings?: {
    player?: {
      enabled?: boolean;
    };
  };
};

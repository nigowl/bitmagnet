export const ALL_FILTER_OPTION = "__all__";
export const CHART_TEXT_COLOR = "#a9b9d2";
export const CHART_LINE_COLOR = "rgba(169,185,210,0.2)";
export const CHART_TOOLTIP_BACKGROUND = "rgba(23,29,39,0.96)";
export const METRICS_CHART_PALETTE = ["#6cb6ff", "#59c9a5", "#f2cc60", "#ff9233", "#ff7b72"];

export const KNOWN_QUEUE_NAMES = [
  "process_torrent",
  "process_torrent_batch",
  "refresh_media_metadata",
  "backfill_cover_cache"
] as const;

export { uniqueSorted } from "@/lib/collections";

export type QueueJob = {
  id: string;
  queue: string;
  status: string;
  payload: string;
  priority: number;
  retries: number;
  maxRetries: number;
  runAfter: string;
  ranAt?: string | null;
  error?: string | null;
  createdAt: string;
};

export type QueueJobsResponse = {
  queue: {
    jobs: {
      totalCount: number;
      hasNextPage?: boolean | null;
      items: QueueJob[];
      aggregations: {
        queue: Array<{ value: string; label: string; count: number }>;
        status: Array<{ value: string; label: string; count: number }>;
      };
    };
  };
};

export type QueueMetricsResponse = {
  queue: {
    metrics: {
      buckets: Array<{
        queue: string;
        status: string;
        createdAtBucket: string;
        count: number;
      }>;
    };
  };
};

export type AdminQueueSettings = {
  cleanupCompletedMaxRecords: number;
  cleanupCompletedMaxAgeDays: number;
};

export type AdminSettingsResponse = {
  settings: {
    performance: {
      queue: AdminQueueSettings;
    };
  };
};

export function normalizeFilterSelection(values: string[]): string[] {
  if (values.length === 0) {
    return [ALL_FILTER_OPTION];
  }
  if (values.includes(ALL_FILTER_OPTION) && values.length > 1) {
    return values.filter((value) => value !== ALL_FILTER_OPTION);
  }
  if (values.length === 1 && values[0] === ALL_FILTER_OPTION) {
    return [ALL_FILTER_OPTION];
  }
  return values;
}

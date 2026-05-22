import type { PlayerTransmissionAudioTrack, PlayerTransmissionStatusResponse } from "@/lib/media-api";

export type TorrentLookupResponse = {
  torrentContent: {
    search: {
      items: Array<{
        infoHash: string;
        title: string;
        contentType?: string | null;
        contentSource?: string | null;
        contentId?: string | null;
        seeders?: number | null;
        leechers?: number | null;
        publishedAt?: string | null;
        torrent: {
          name: string;
          size: number;
          filesCount?: number | null;
          tagNames?: string[] | null;
          magnetUri?: string | null;
          sources?: Array<{
            key?: string | null;
            name?: string | null;
          }> | null;
        };
        videoResolution?: string | null;
        videoSource?: string | null;
        content?: {
          title?: string | null;
          runtime?: number | null;
          collections?: Array<{
            type?: string | null;
            name?: string | null;
          }> | null;
          attributes?: Array<{
            source?: string | null;
            key?: string | null;
            value?: unknown;
          }> | null;
        } | null;
      }>;
    };
  };
};

export type PlayerStatus = "idle" | "initializing" | "buffering" | "ready" | "playing" | "error";
export type DiagnosticLevel = "info" | "warn" | "error";

export type DiagnosticEntry = {
  id: string;
  timestamp: number;
  level: DiagnosticLevel;
  step: string;
  message: string;
  detailsText?: string;
};

export type TorrentDetailLite = {
  infoHash: string;
  title: string;
  contentType?: string;
  seeders?: number | null;
  leechers?: number | null;
  magnetUri?: string | null;
  mediaTitle?: string;
  mediaTitleZh?: string;
  mediaTitleEn?: string;
  mediaEntryId?: string;
  mediaHref?: string;
  sizeBytes?: number;
  filesCount?: number;
  sourceNames?: string[];
  tagNames?: string[];
  videoResolution?: string;
  videoSource?: string;
  publishedAt?: string;
  runtimeSeconds?: number;
};

export type PlayerSubtitleSiteLink = {
  id: string;
  label: string;
  href: string;
};

export type PlaybackFileOption = {
  value: string;
  index: number;
  name: string;
  label: string;
  resolutionLabel: string;
  length: number;
};

export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

export type HlsLike = {
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  loadSource: (url: string) => void;
  on: (event: string, handler: (event: string, data?: unknown) => void) => void;
  recoverMediaError?: () => void;
  startLoad?: (startPosition?: number) => void;
  stopLoad?: () => void;
};

export type NativeAudioTrack = {
  id?: string;
  label?: string;
  language?: string;
  kind?: string;
  enabled?: boolean;
};

export type NativeAudioTrackList = {
  length: number;
  [index: number]: NativeAudioTrack;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

export type VideoWithAudioTracks = HTMLVideoElement & {
  audioTracks?: NativeAudioTrackList;
};

export type PlaybackProgressRecord = {
  infoHash: string;
  fileIndex: number;
  seconds: number;
  duration: number;
  updatedAt: number;
};

export type PlaybackFileSelectionRecord = {
  infoHash: string;
  fileIndex: number;
  updatedAt: number;
};

export type SubtitleStylePreset = {
  scale: number;
  textColor: string;
  backgroundColor: string;
  verticalPercent: number;
};

export type PlayerGlobalPreferences = {
  playbackRate?: number;
  videoFitMode?: "contain" | "cover" | "fill";
  transcodePrebufferSeconds?: number;
  outputResolution?: number;
  subtitleStyleScale?: number;
  subtitleStyleTextColor?: string;
  subtitleStyleBackgroundColor?: string;
  subtitleStyleVerticalPercent?: number;
};

export type PlayerTrackPreferences = {
  selectedSubtitleId?: string;
  selectedAudioTrackId?: string;
};

export type PlayableRatioRange = {
  start: number;
  end: number;
};

export type PlayableTranscodeStart = {
  seconds: number;
  startBytes: number;
  prebufferSeconds: number;
  availableAheadSeconds: number;
  adjusted: boolean;
  originalSeconds: number;
  reason: "complete" | "no_status" | "no_timeline" | "inside_range" | "outside_cached_range" | "near_range_end";
  range?: PlayableRatioRange;
};

export type MediaLookupItem = {
  content?: {
    title?: string | null;
    runtime?: number | null;
    attributes?: Array<{ source?: string | null; key?: string | null; value?: unknown }> | null;
  } | null;
};

export type MediaLookupTitleItem = {
  content?: {
    title?: string | null;
    attributes?: Array<{ source?: string | null; key?: string | null; value?: unknown }> | null;
  } | null;
};

export type MediaLookupAttributesItem = {
  content?: {
    runtime?: number | null;
    attributes?: Array<{ key?: string | null; value?: unknown }> | null;
  } | null;
};

export type MediaSubtitleConvertResult = {
  text: string;
};

export type SubtitleTextReader = (file: File) => Promise<string>;

export type PlaybackSelectionOptions = {
  file: PlaybackFileOption | null;
  status: PlayerTransmissionStatusResponse | null;
  outputResolution: number;
  selectedAudioTrackId: string;
  serverAudioTracks: PlayerTransmissionAudioTrack[];
};

import type { MediaDetailTorrent } from "@/lib/media-api";

const VIDEO_FILE_EXTENSIONS = new Set([
  "3gp",
  "avi",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "rmvb",
  "ts",
  "webm",
  "wmv"
]);

export type TorrentFileItem = {
  infoHash: string;
  index: number;
  path: string;
  size: number;
  fileType?: string | null;
};

export type EpisodeMatchedFile = {
  index: number;
  path: string;
  size: number;
};

export type MediaEpisodeTorrent = {
  torrent: MediaDetailTorrent;
  matchedFiles: EpisodeMatchedFile[];
};

export type MediaEpisodeGroup = {
  key: string;
  episodeNumber: number;
  displayLabel: string;
  torrents: MediaEpisodeTorrent[];
};

type EpisodeMatch = {
  episodeNumber: number;
  file: EpisodeMatchedFile;
};

export function buildEpisodeGroups(
  torrents: MediaDetailTorrent[],
  filesByInfoHash: Record<string, TorrentFileItem[]>
): MediaEpisodeGroup[] {
  const groups = new Map<number, MediaEpisodeGroup>();

  torrents.forEach((torrent) => {
    const matches = collectTorrentEpisodeMatches(torrent, filesByInfoHash);
    const filesByEpisode = new Map<number, EpisodeMatchedFile[]>();

    matches.forEach((match) => {
      const files = filesByEpisode.get(match.episodeNumber) ?? [];
      files.push(match.file);
      filesByEpisode.set(match.episodeNumber, files);
    });

    filesByEpisode.forEach((matchedFiles, episodeNumber) => {
      const group = groups.get(episodeNumber) ?? {
        key: String(episodeNumber),
        episodeNumber,
        displayLabel: formatEpisodeLabel(episodeNumber),
        torrents: []
      };
      upsertEpisodeTorrent(group, torrent, matchedFiles);
      groups.set(episodeNumber, group);
    });
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      torrents: group.torrents.sort((left, right) => (right.torrent.seeders ?? 0) - (left.torrent.seeders ?? 0))
    }))
    .sort((left, right) => left.episodeNumber - right.episodeNumber);
}

function upsertEpisodeTorrent(
  group: MediaEpisodeGroup,
  torrent: MediaDetailTorrent,
  matchedFiles: EpisodeMatchedFile[]
) {
  const infoHash = normalizeInfoHash(torrent.infoHash);
  const existing = group.torrents.find((entry) => normalizeInfoHash(entry.torrent.infoHash) === infoHash);
  if (!existing) {
    group.torrents.push({
      torrent,
      matchedFiles: dedupeFiles(matchedFiles)
    });
    return;
  }
  existing.matchedFiles = dedupeFiles([...existing.matchedFiles, ...matchedFiles]);
}

export function groupFilesByInfoHash(items: TorrentFileItem[]): Record<string, TorrentFileItem[]> {
  return items.reduce<Record<string, TorrentFileItem[]>>((acc, item) => {
    const key = normalizeInfoHash(item.infoHash);
    if (!key) return acc;
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
}

export function uniqueInfoHashes(torrents: MediaDetailTorrent[]): string[] {
  return Array.from(new Set(torrents.map((torrent) => normalizeInfoHash(torrent.infoHash)).filter(Boolean)));
}

function collectTorrentEpisodeMatches(
  torrent: MediaDetailTorrent,
  filesByInfoHash: Record<string, TorrentFileItem[]>
): EpisodeMatch[] {
  const key = normalizeInfoHash(torrent.infoHash);
  const files = (filesByInfoHash[key] ?? []).filter(isEpisodeFileCandidate);
  const sourceFiles = files.length > 0
    ? files
    : [{
      infoHash: torrent.infoHash,
      index: 0,
      path: torrent.torrent.name || torrent.title,
      size: torrent.size,
      fileType: torrent.torrent.fileType ?? null
    }];

  return sourceFiles
    .map((file) => {
      const episodeNumber = extractEpisodeNumber(file.path);
      if (!episodeNumber) return null;
      return {
        episodeNumber,
        file: {
          index: file.index,
          path: file.path,
          size: file.size
        }
      };
    })
    .filter((match): match is EpisodeMatch => Boolean(match));
}

function extractEpisodeNumber(path: string): number | null {
  const name = basenameWithoutExtension(path).replace(/[._]+/g, " ");
  const explicitPatterns: Array<{ pattern: RegExp; group: number }> = [
    { pattern: /(?:^|[^a-z0-9])s\d{1,2}\s*e\s*([0-9０-９]{1,4})(?:[^a-z0-9]|$)/i, group: 1 },
    { pattern: /(?:^|[^a-z0-9])\d{1,2}x([0-9０-９]{1,4})(?:[^a-z0-9]|$)/i, group: 1 },
    { pattern: /第\s*([0-9０-９一二三四五六七八九十百两]+)\s*[集話话]/i, group: 1 },
    { pattern: /(?:^|[^a-z0-9])(?:ep|episode)\s*([0-9０-９]{1,4})(?:[^a-z0-9]|$)/i, group: 1 },
    { pattern: /(?:^|[^a-z0-9])e\s*([0-9０-９]{1,4})(?:[^a-z0-9]|$)/i, group: 1 }
  ];

  for (const { pattern, group } of explicitPatterns) {
    const match = name.match(pattern);
    const episodeNumber = match ? parseEpisodeToken(match[group], false) : null;
    if (episodeNumber) return episodeNumber;
  }

  const bracketMatch = name.match(/(?:^|[\[(【\s-])0*([0-9０-９]{1,3})(?:v\d+)?(?:[\])】\s-]|$)/i);
  return bracketMatch ? parseEpisodeToken(bracketMatch[1], true) : null;
}

function parseEpisodeToken(value: string, generic: boolean): number | null {
  const normalized = normalizeDigits(value.trim());
  const parsedNumber = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : parseChineseNumber(normalized);
  if (parsedNumber === null || !Number.isFinite(parsedNumber) || parsedNumber <= 0) return null;
  if (generic && (parsedNumber > 300 || isLikelyVideoSpecNumber(parsedNumber))) return null;
  if (!generic && parsedNumber > 2000) return null;
  return parsedNumber;
}

function parseChineseNumber(value: string): number | null {
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value in digits) return digits[value];
  if (!/^[一二三四五六七八九十百两]+$/.test(value)) return null;

  let total = 0;
  let section = 0;
  for (const char of value) {
    if (char === "百") {
      section = (section || 1) * 100;
      total += section;
      section = 0;
    } else if (char === "十") {
      section = (section || 1) * 10;
      total += section;
      section = 0;
    } else {
      section = digits[char] ?? 0;
    }
  }
  return total + section || null;
}

function isEpisodeFileCandidate(file: TorrentFileItem): boolean {
  const extension = getExtension(file.path);
  if (extension && VIDEO_FILE_EXTENSIONS.has(extension)) return true;
  if (file.fileType?.toLowerCase().includes("video")) return true;
  return !extension && !file.fileType;
}

function isLikelyVideoSpecNumber(value: number): boolean {
  return value === 480 || value === 720 || value === 1080 || value === 1440 || value === 2160 || value === 4320;
}

function dedupeFiles(files: EpisodeMatchedFile[]): EpisodeMatchedFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.index}:${file.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatEpisodeLabel(episodeNumber: number): string {
  return String(episodeNumber).padStart(2, "0");
}

function basenameWithoutExtension(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? path;
  return filename.replace(/\.[^.]+$/, "");
}

function getExtension(path: string): string {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function normalizeInfoHash(value: string): string {
  return value.trim().toLowerCase();
}

export const VIDEO_FILE_EXTENSIONS = [
  ".mp4", ".m4v", ".webm", ".mkv", ".mov", ".avi", ".flv", ".ts", ".m2ts", ".mpeg", ".mpg",
  ".wmv", ".asf", ".3gp", ".3g2", ".f4v", ".rm", ".rmvb", ".vob", ".mxf", ".divx", ".xvid"
];

export function isVideoFile(path: string, fileType?: string | null): boolean {
  const normalizedPath = String(path || "").trim().toLowerCase();
  if (!normalizedPath) return false;
  if (VIDEO_FILE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext))) {
    return true;
  }
  return String(fileType || "").trim().toLowerCase().includes("video");
}

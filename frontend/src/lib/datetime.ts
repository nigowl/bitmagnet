export function formatDateTime(raw?: string | null): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function formatDateTimeOrRaw(raw?: string | null): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
}

export function formatRelativeTime(raw?: string | null, locale: string = "zh"): string {
  if (!raw) return "-";
  const timestamp = new Date(raw).getTime();
  if (Number.isNaN(timestamp)) return "-";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return locale === "en" ? "Just now" : "刚刚";
  }

  const units = [
    { seconds: 60, zh: "分钟前", en: "minutes ago" },
    { seconds: 60 * 60, zh: "小时前", en: "hours ago" },
    { seconds: 60 * 60 * 24, zh: "天前", en: "days ago" },
    { seconds: 60 * 60 * 24 * 30, zh: "个月前", en: "months ago" },
    { seconds: 60 * 60 * 24 * 365, zh: "年前", en: "years ago" }
  ];

  let value = elapsedSeconds;
  let unit = units[0];
  for (const candidate of units) {
    if (elapsedSeconds >= candidate.seconds) {
      value = Math.floor(elapsedSeconds / candidate.seconds);
      unit = candidate;
    }
  }

  return locale === "en" ? `${value} ${unit.en}` : `${value}${unit.zh}`;
}

export function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

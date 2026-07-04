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

export function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function normalizeInfoHash(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInfoHashList(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeInfoHash).filter(Boolean)));
}

export function resolveInternalHref(sourceHref: string | null | undefined, fallbackHref: string): string {
  const normalized = sourceHref?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallbackHref;
  }
  return normalized;
}

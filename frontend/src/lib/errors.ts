function normalizeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "")).trim().toLowerCase();
}

export function isRequestCanceledError(error: unknown): boolean {
  const normalized = normalizeErrorMessage(error);
  if (!normalized) return false;
  return normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized.includes("context canceled") ||
    normalized.includes("request canceled") ||
    normalized.includes("request cancelled") ||
    normalized.includes("request aborted");
}

export function getErrorMessage(error: unknown): string | null {
  if (isRequestCanceledError(error)) {
    return null;
  }
  return error instanceof Error ? error.message : String(error);
}

type Translate = (key: string) => string;

const errorMessageKeys: Record<string, string> = {
  "invalid credentials": "auth.invalidCredentials",
  "membership login required": "auth.membershipRequired",
  unauthorized: "auth.needLogin",
  forbidden: "auth.adminOnly",
  "invalid input": "auth.invalidInput",
  "user already exists": "auth.userExists",
  "invite code is required": "auth.inviteRequired",
  "invalid invite code": "auth.invalidInviteCode",
  "invite code exhausted": "auth.inviteCodeExhausted"
};

export function getLocalizedErrorMessage(error: unknown, t: Translate): string | null {
  const message = getErrorMessage(error);
  if (!message) {
    return null;
  }
  const normalized = normalizeErrorMessage(message);
  const key = errorMessageKeys[normalized];
  const fallbackKey = key || Object.entries(errorMessageKeys).find(([needle]) => normalized.includes(needle))?.[1];
  if (!fallbackKey) {
    return message;
  }
  const translated = t(fallbackKey);
  return translated === fallbackKey ? message : translated;
}

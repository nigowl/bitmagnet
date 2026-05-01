export function isRequestCanceledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
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
  const normalized = message.trim().toLowerCase();
  const key = errorMessageKeys[normalized];
  if (!key) {
    return message;
  }
  const translated = t(key);
  return translated === key ? message : translated;
}

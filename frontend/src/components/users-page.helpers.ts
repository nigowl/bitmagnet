export type AdminUserItem = {
  id: number;
  username: string;
  role: "admin" | "user";
  createdAt: string;
  inviteCodeId?: number | null;
  inviteCode?: string;
  inviteCodeUsedAt?: string | null;
  inviteNote?: string;
};

export type InviteItem = {
  id: number;
  code: string;
  note: string;
  maxUses: number;
  usedCount: number;
  enabled: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UsersResponse = { items: AdminUserItem[] };
export type UserResponse = { user: AdminUserItem };
export type InvitesResponse = { items: InviteItem[] };
export type InviteBatchResponse = { items: InviteItem[] };

export type InviteFormState = {
  code: string;
  note: string;
  maxUses: number;
  enabled: boolean;
  expiresAt: string;
};

export type InviteBatchOptions = {
  note: string;
  maxUses: number;
  enabled: boolean;
  expiresAt: string;
};

export type UserFormState = {
  username: string;
  password: string;
  role: "admin" | "user";
};

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export const DEFAULT_INVITE_FORM: InviteFormState = {
  code: "",
  note: "",
  maxUses: 1,
  enabled: true,
  expiresAt: ""
};

export function toISODateTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function formatDate(raw?: string | null): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

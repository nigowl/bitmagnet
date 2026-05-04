import axios from "axios";

const apiBaseURL = process.env.NEXT_PUBLIC_BITMAGNET_API_BASE_URL?.replace(/\/$/, "") || "";

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface APIEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const authTokenStorageKey = "bitmagnet-auth-token";
const authTokenCookieKey = "bitmagnet-auth-token";

function getCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const needle = `${name}=`;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(needle)) continue;
    const raw = trimmed.slice(needle.length);
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

function setTokenCookie(token: string) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(token);
  const maxAgeSeconds = 60 * 60 * 24 * 30;
  document.cookie = `${authTokenCookieKey}=${encoded}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearTokenCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${authTokenCookieKey}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  const fromStorage = window.localStorage.getItem(authTokenStorageKey) || "";
  if (fromStorage.trim()) {
    const normalized = fromStorage.trim();
    if (!getCookieValue(authTokenCookieKey)) {
      setTokenCookie(normalized);
    }
    return normalized;
  }
  return getCookieValue(authTokenCookieKey).trim();
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  const normalized = token.trim();
  window.localStorage.setItem(authTokenStorageKey, normalized);
  setTokenCookie(normalized);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(authTokenStorageKey);
  clearTokenCookie();
}

export async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>) {
  const token = getAuthToken();
  const response = await axios.post<GraphQLResponse<T>>(
    `${apiBaseURL}/graphql`,
    { query, variables },
    {
      timeout: 30000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  );

  if (response.data.errors?.length) {
    throw new Error(response.data.errors.map((e) => e.message).join("; "));
  }

  if (!response.data.data) {
    throw new Error("GraphQL response did not include data.");
  }

  return response.data.data;
}

export async function apiRequest<T>(path: string, options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; data?: unknown }) {
  const token = getAuthToken();
  try {
    const response = await axios.request<T | APIEnvelope<T>>({
      url: `${apiBaseURL}${path}`,
      method: options?.method || "GET",
      data: options?.data,
      timeout: 30000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    return unwrapAPIResponse<T>(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data;
      const message = extractAPIErrorMessage(payload, error.message);
      throw new Error(message);
    }
    throw error;
  }
}

function unwrapAPIResponse<T>(payload: T | APIEnvelope<T>): T {
  if (!isAPIEnvelope<T>(payload)) {
    return payload as T;
  }
  if (payload.code !== 0) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload.data;
}

function isAPIEnvelope<T>(payload: unknown): payload is APIEnvelope<T> {
  if (!payload || typeof payload !== "object") return false;
  const object = payload as Record<string, unknown>;
  return typeof object.code === "number" && typeof object.message === "string" && "data" in object;
}

function extractAPIErrorMessage(payload: unknown, fallback: string): string {
  if (isAPIEnvelope<unknown>(payload)) {
    return payload.message || fallback;
  }
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    if (typeof object.error === "string" && object.error.trim()) return object.error.trim();
    if (typeof object.message === "string" && object.message.trim()) return object.message.trim();
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  return fallback;
}

export { apiBaseURL };

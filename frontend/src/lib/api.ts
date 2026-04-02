import axios from "axios";

const apiBaseURL = process.env.NEXT_PUBLIC_BITMAGNET_API_BASE_URL?.replace(/\/$/, "") || "";

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

const authTokenStorageKey = "bitmagnet-auth-token";

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(authTokenStorageKey) || "";
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(authTokenStorageKey, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(authTokenStorageKey);
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
    const response = await axios.request<T>({
      url: `${apiBaseURL}${path}`,
      method: options?.method || "GET",
      data: options?.data,
      timeout: 30000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        typeof error.response?.data === "object" && error.response?.data && "error" in error.response.data
          ? String((error.response.data as { error?: unknown }).error || error.message)
          : error.message;
      throw new Error(message);
    }
    throw error;
  }
}

export { apiBaseURL };

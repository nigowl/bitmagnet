"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthToken, setAuthToken } from "@/lib/api";
import { isRequestCanceledError } from "@/lib/errors";

export type Role = "admin" | "user";

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
};

export type RememberFor = "1d" | "1w" | "1m";

export type AccessSettings = {
  membershipEnabled: boolean;
  registrationEnabled: boolean;
  inviteRequired: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  accessSettings: AccessSettings;
  favorites: string[];
  isAdmin: boolean;
  login: (username: string, password: string, rememberFor?: RememberFor) => Promise<void>;
  register: (username: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshAccessSettings: () => Promise<void>;
  refreshFavorites: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  hasFavorite: (infoHash: string) => boolean;
  toggleFavorite: (infoHash: string) => Promise<void>;
};

type AuthResult = {
  token: string;
  user: AuthUser;
};

type AccessSettingsResponse = {
  settings: AccessSettings;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessSettings, setAccessSettings] = useState<AccessSettings>({
    membershipEnabled: false,
    registrationEnabled: true,
    inviteRequired: false
  });
  const [favorites, setFavorites] = useState<string[]>([]);

  const refreshAccessSettings = useCallback(async () => {
    try {
      const data = await apiRequest<AccessSettingsResponse>("/api/auth/settings");
      setAccessSettings(data.settings);
    } catch {
      setAccessSettings({
        membershipEnabled: false,
        registrationEnabled: true,
        inviteRequired: false
      });
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      return;
    }

    const data = await apiRequest<{ items: string[] }>("/api/users/favorites");
    setFavorites(data.items || []);
  }, [user]);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: AuthUser }>("/api/users/me");
      setUser(data.user);
    } catch {
      setUser(null);
      setFavorites([]);
      clearAuthToken();
    }
  }, []);

  const hydrateAuth = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshMe(), refreshAccessSettings()]);
    } finally {
      setLoading(false);
    }
  }, [refreshAccessSettings, refreshMe]);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    void refreshFavorites().catch((error: unknown) => {
      if (!isRequestCanceledError(error)) {
        setFavorites([]);
      }
    });
  }, [refreshFavorites, user]);

  const login = useCallback(async (username: string, password: string, rememberFor?: RememberFor) => {
    const result = await apiRequest<AuthResult>("/api/auth/login", {
      method: "POST",
      data: {
        username,
        password,
        rememberFor
      }
    });
    setAuthToken(result.token);
    setUser(result.user);
    try {
      const fav = await apiRequest<{ items: string[] }>("/api/users/favorites");
      setFavorites(fav.items || []);
    } catch {
      setFavorites([]);
    }
  }, []);

  const register = useCallback(async (username: string, password: string, inviteCode?: string) => {
    const result = await apiRequest<AuthResult>("/api/auth/register", {
      method: "POST",
      data: { username, password, inviteCode }
    });
    setAuthToken(result.token);
    setUser(result.user);
    setFavorites([]);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // no-op, local logout still applies.
    }
    clearAuthToken();
    setUser(null);
    setFavorites([]);
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await apiRequest<{ ok: boolean }>("/api/users/password", {
      method: "POST",
      data: { oldPassword, newPassword }
    });
  }, []);

  const hasFavorite = useCallback(
    (infoHash: string) => favorites.includes(infoHash),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (infoHash: string) => {
      if (!user) {
        throw new Error("unauthorized");
      }

      if (favorites.includes(infoHash)) {
        await apiRequest<{ ok: boolean }>(`/api/users/favorites/${infoHash}`, { method: "DELETE" });
      } else {
        await apiRequest<{ ok: boolean }>(`/api/users/favorites/${infoHash}`, { method: "POST" });
      }

      await refreshFavorites();
    },
    [favorites, refreshFavorites, user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      accessSettings,
      favorites,
      isAdmin: user?.role === "admin",
      login,
      register,
      logout,
      refreshMe,
      refreshAccessSettings,
      refreshFavorites,
      changePassword,
      hasFavorite,
      toggleFavorite
    }),
    [
      accessSettings,
      changePassword,
      favorites,
      hasFavorite,
      loading,
      login,
      logout,
      refreshAccessSettings,
      refreshFavorites,
      refreshMe,
      register,
      toggleFavorite,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

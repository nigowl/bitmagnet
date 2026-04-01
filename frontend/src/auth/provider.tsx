"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthToken, setAuthToken } from "@/lib/api";

export type Role = "admin" | "user";

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  favorites: string[];
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshFavorites: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  hasFavorite: (infoHash: string) => boolean;
  toggleFavorite: (infoHash: string) => Promise<void>;
};

type AuthResult = {
  token: string;
  user: AuthUser;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);

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
      await refreshMe();
    } finally {
      setLoading(false);
    }
  }, [refreshMe]);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    void refreshFavorites();
  }, [refreshFavorites, user]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiRequest<AuthResult>("/api/auth/login", {
      method: "POST",
      data: { username, password }
    });
    setAuthToken(result.token);
    setUser(result.user);
    const fav = await apiRequest<{ items: string[] }>("/api/users/favorites");
    setFavorites(fav.items || []);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const result = await apiRequest<AuthResult>("/api/auth/register", {
      method: "POST",
      data: { username, password }
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
      favorites,
      isAdmin: user?.role === "admin",
      login,
      register,
      logout,
      refreshMe,
      refreshFavorites,
      changePassword,
      hasFavorite,
      toggleFavorite
    }),
    [changePassword, favorites, hasFavorite, loading, login, logout, refreshFavorites, refreshMe, register, toggleFavorite, user]
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

"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import en from "./en.json";
import zh from "./zh.json";

type Locale = "en" | "zh";

type Dictionary = typeof en;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const dictionaries: Record<Locale, Dictionary> = { en, zh };
const localeStorageKey = "bitmagnet-locale";

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveByPath(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }

  return key
    .split(".")
    .reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), obj)
    ?.toString();
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = window.localStorage.getItem(localeStorageKey);
  if (saved === "en" || saved === "zh") {
    return saved;
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(localeStorageKey, nextLocale);
  }, []);

  const t = useCallback(
    (key: string) => {
      const active = resolveByPath(dictionaries[locale], key);
      if (active) {
        return active;
      }

      const fallback = resolveByPath(dictionaries.en, key);
      return fallback || key;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}

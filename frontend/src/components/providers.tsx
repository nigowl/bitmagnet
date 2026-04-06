"use client";

import {
  type MantineColorScheme,
  type MantineColorSchemeManager,
  MantineProvider,
  createTheme
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { AuthDialogProvider } from "@/auth/dialog";
import { AuthProvider } from "@/auth/provider";
import { I18nProvider, type Locale } from "@/languages/provider";

const theme = createTheme({
  primaryColor: "orange",
  colors: {
    // Use a blue-slate neutral palette to avoid harsh light-gray accents in dark mode.
    slate: [
      "#f4f6fb",
      "#e7edf7",
      "#d2deee",
      "#b6c7de",
      "#94aacc",
      "#748eb8",
      "#5b739b",
      "#495c7b",
      "#3a4a61",
      "#2d394a"
    ],
    gray: [
      "#f4f6fb",
      "#e7edf7",
      "#d2deee",
      "#b6c7de",
      "#94aacc",
      "#748eb8",
      "#5b739b",
      "#495c7b",
      "#3a4a61",
      "#2d394a"
    ]
  },
  defaultRadius: "md",
  radius: {
    xs: "6px",
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "22px"
  },
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  headings: { fontFamily: "var(--font-sans)" },
  components: {
    Modal: {
      defaultProps: {
        centered: true
      },
      styles: {
        content: {
          borderRadius: "var(--radius-lg)",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)"
        },
        header: {
          borderBottom: "1px solid var(--card-border)",
          background: "transparent"
        },
        body: {
          padding: "16px"
        },
        title: {
          fontWeight: 700,
          color: "var(--page-text)"
        }
      }
    }
  }
});

const colorSchemeCookieKey = "bitmagnet-color-scheme";

function isMantineColorScheme(value: string | null | undefined): value is MantineColorScheme {
  return value === "light" || value === "dark" || value === "auto";
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const matched = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));

  return matched ? decodeURIComponent(matched.slice(prefix.length)) : null;
}

const colorSchemeManager: MantineColorSchemeManager = {
  get: (defaultValue) => {
    const cookieValue = getCookieValue(colorSchemeCookieKey);
    if (isMantineColorScheme(cookieValue)) {
      return cookieValue;
    }
    return defaultValue;
  },
  set: (value) => {
    if (typeof document === "undefined") {
      return;
    }

    document.cookie = `${colorSchemeCookieKey}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  },
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {
    if (typeof document === "undefined") {
      return;
    }

    document.cookie = `${colorSchemeCookieKey}=; path=/; max-age=0; samesite=lax`;
  }
};

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  return (
    <MantineProvider theme={theme} colorSchemeManager={colorSchemeManager} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications position="top-right" />
        <I18nProvider initialLocale={initialLocale}>
          <AuthProvider>
            <AuthDialogProvider>{children}</AuthDialogProvider>
          </AuthProvider>
        </I18nProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

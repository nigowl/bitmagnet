import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "plyr/dist/plyr.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ApplicationShell } from "@/components/app-shell";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const defaultSiteURL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3334";

export const metadata: Metadata = {
  metadataBase: new URL(defaultSiteURL),
  title: "bitmagnet（比特磁铁）",
  description: "Media playback and search workspace powered by bitmagnet."
};

type Locale = "en" | "zh";

const localeCookieKey = "bitmagnet-locale";

function normalizeLocale(locale: string | null | undefined): Locale | undefined {
  if (locale === "en" || locale === "zh") {
    return locale;
  }

  return undefined;
}

function localeFromAcceptLanguage(acceptLanguage: string | null): Locale {
  return acceptLanguage?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const initialLocale =
    normalizeLocale(cookieStore.get(localeCookieKey)?.value) ??
    localeFromAcceptLanguage(headerStore.get("accept-language"));

  return (
    <html
      lang={initialLocale === "zh" ? "zh-CN" : "en"}
      className={`${sans.variable} ${mono.variable}`}
      data-mantine-color-scheme="dark"
      suppressHydrationWarning
    >
      <head />
      <body>
        <Providers initialLocale={initialLocale}>
          <ApplicationShell>{children}</ApplicationShell>
        </Providers>
      </body>
    </html>
  );
}

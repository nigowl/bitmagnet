import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ApplicationShell } from "@/components/app-shell";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "bitmagnet frontend",
  description: "Next.js + Mantine frontend for bitmagnet"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <ApplicationShell>{children}</ApplicationShell>
        </Providers>
      </body>
    </html>
  );
}

"use client";

import {
  MantineProvider,
  createTheme
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { I18nProvider } from "@/languages/provider";

const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "xl",
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  headings: { fontFamily: "var(--font-sans)" }
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <ModalsProvider>
        <Notifications position="top-right" />
        <I18nProvider>{children}</I18nProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

"use client";

import { useCallback, useState } from "react";
import { notifications } from "@mantine/notifications";
import * as player from "./torrent-player/torrent-player-helpers";

type DiagnosticLevel = player.DiagnosticLevel;
type DiagnosticEntry = player.DiagnosticEntry;
type TFunction = (key: string) => string;

export function useTorrentPlayerDiagnostics(t: TFunction) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [diagnosticsOpened, setDiagnosticsOpened] = useState(false);

  const pushDiagnostic = useCallback((level: DiagnosticLevel, step: string, message: string, details?: unknown) => {
    const now = Date.now();
    const detailsText = player.stringifyDetails(details);
    setDiagnostics((current) => {
      const next: DiagnosticEntry[] = [
        ...current,
        {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          level,
          step,
          message,
          detailsText
        }
      ];
      return next.slice(-160);
    });
  }, []);

  const logInfo = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("info", step, message, details);
  }, [pushDiagnostic]);

  const logWarn = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("warn", step, message, details);
  }, [pushDiagnostic]);

  const logError = useCallback((step: string, message: string, details?: unknown) => {
    pushDiagnostic("error", step, message, details);
  }, [pushDiagnostic]);

  const handleCopyLogs = useCallback(async () => {
    const text = diagnostics
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toISOString();
        const suffix = entry.detailsText ? ` ${entry.detailsText}` : "";
        return `[${timestamp}] ${entry.level.toUpperCase()} ${entry.step}: ${entry.message}${suffix}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: "green", message: t("media.player.copyLogsDone") });
    } catch {
      notifications.show({ color: "red", message: t("media.player.copyLogsFailed") });
    }
  }, [diagnostics, t]);

  return {
    diagnostics,
    diagnosticsOpened,
    setDiagnostics,
    setDiagnosticsOpened,
    logInfo,
    logWarn,
    logError,
    handleCopyLogs
  };
}

"use client";

import { useCallback, useState } from "react";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "@/lib/api";
import { parseYear } from "./settings-page.helpers";
import type { PluginTestResponse, PluginTestResult } from "./settings-page.types";

type PluginKey = "tmdb" | "imdb" | "douban";

export function usePluginTestsController() {
  const [pluginTesting, setPluginTesting] = useState<Record<string, boolean>>({});
  const [pluginResults, setPluginResults] = useState<Record<string, PluginTestResult | null>>({});
  const [pluginInputs, setPluginInputs] = useState({
    tmdb: { query: "", contentType: "movie", year: "" },
    imdb: { imdbId: "" },
    douban: { title: "", contentType: "movie", year: "" }
  });

  const runPluginTest = useCallback(async (plugin: PluginKey) => {
    setPluginTesting((current) => ({ ...current, [plugin]: true }));
    try {
      const data = await apiRequest<PluginTestResponse>(`/api/admin/settings/plugins/${plugin}/test`, {
        method: "POST",
        data: buildPluginPayload(plugin, pluginInputs)
      });
      setPluginResults((current) => ({ ...current, [plugin]: data.result }));
      notifications.show({ color: data.result.success ? "green" : "yellow", message: data.result.message });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginTesting((current) => ({ ...current, [plugin]: false }));
    }
  }, [pluginInputs]);

  return {
    pluginInputs,
    setPluginInputs,
    pluginTesting,
    pluginResults,
    runPluginTest
  };
}

function buildPluginPayload(
  plugin: PluginKey,
  inputs: ReturnType<typeof usePluginTestsController>["pluginInputs"]
): Record<string, unknown> {
  if (plugin === "tmdb") {
    return {
      query: inputs.tmdb.query,
      contentType: inputs.tmdb.contentType,
      year: parseYear(inputs.tmdb.year)
    };
  }
  if (plugin === "imdb") {
    return {
      imdbId: inputs.imdb.imdbId
    };
  }
  return {
    title: inputs.douban.title,
    contentType: inputs.douban.contentType,
    year: parseYear(inputs.douban.year)
  };
}

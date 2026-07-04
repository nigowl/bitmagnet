"use client";

import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { CircleHelp } from "lucide-react";
import { formatDateTimeOrRaw } from "@/lib/datetime";
import type { SystemSettings } from "./settings-page.types";

type TFunction = (key: string) => string;

export type RuntimeWorkerDetail = {
  kind: string;
  scope: string;
  desc: string;
};

export function buildDhtWeekdayOptions(t: TFunction) {
  return [
    { value: "1", label: t("settings.weekdays.mon") },
    { value: "2", label: t("settings.weekdays.tue") },
    { value: "3", label: t("settings.weekdays.wed") },
    { value: "4", label: t("settings.weekdays.thu") },
    { value: "5", label: t("settings.weekdays.fri") },
    { value: "6", label: t("settings.weekdays.sat") },
    { value: "7", label: t("settings.weekdays.sun") }
  ];
}

export function buildDhtHourOptions() {
  return Array.from({ length: 25 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, "0")}:00`
  }));
}

export function isDhtScheduleInvalid(settings: SystemSettings) {
  return (
    settings.performance.dht.scheduleEnabled &&
    (settings.performance.dht.scheduleWeekdays.length === 0 || settings.performance.dht.scheduleStartHour >= settings.performance.dht.scheduleEndHour)
  );
}

export function createPerformanceLabelRenderer(t: TFunction) {
  function PerformanceLabelRenderer(label: string, impact: string) {
    return (
    <Group gap={6} wrap="nowrap">
      <span>{label}</span>
      <Tooltip label={impact} withArrow multiline maw={340}>
        <ActionIcon
          className="app-icon-btn"
          size={18}
          radius="xl"
          variant="subtle"
          color="slate"
          aria-label={t("settings.performanceImpactAria")}
        >
          <CircleHelp size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
    );
  }
  return PerformanceLabelRenderer;
}

export function formatRuntimeCheckedAt(value: string) {
  return formatDateTimeOrRaw(value);
}

export function prettifyGoDuration(raw?: string | number) {
  if (raw === undefined || raw === null) return "-";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const milliseconds = raw / 1_000_000;
    if (milliseconds < 1000) {
      return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`;
    }
    const seconds = milliseconds / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
  }
  const text = String(raw).trim();
  if (!text) return "-";
  return text.replace(/µs/g, "us").replace(/h/g, "h ").replace(/m(?!s)/g, "m ").replace(/s/g, "s ").trim();
}

export function createRuntimeValueRenderer() {
  function RuntimeValueRenderer(value: string) {
    const maxLength = 72;
    if (value.length <= maxLength) {
      return <Text className="settings-runtime-value">{value}</Text>;
    }
    const truncated = `${value.slice(0, maxLength - 1)}…`;
    return (
      <Tooltip label={value} withArrow multiline maw={560}>
        <Text className="settings-runtime-value settings-runtime-value-truncated">{truncated}</Text>
      </Tooltip>
    );
  }
  return RuntimeValueRenderer;
}

export function resolveWorkerDetails(t: TFunction, key: string): RuntimeWorkerDetail {
  if (key === "queue_server") {
    return {
      kind: t("settings.workerKindQueue"),
      scope: "system.performance.queue.*",
      desc: t("settings.workerDescQueue")
    };
  }
  if (key === "dht_crawler") {
    return {
      kind: t("settings.workerKindDht"),
      scope: "system.performance.dht.*",
      desc: t("settings.workerDescDht")
    };
  }
  if (key === "web_server") {
    return {
      kind: t("settings.workerKindWeb"),
      scope: "system.*",
      desc: t("settings.workerDescWeb")
    };
  }
  return {
    kind: t("settings.workerKindGeneric"),
    scope: "-",
    desc: t("settings.workerDescGeneric")
  };
}

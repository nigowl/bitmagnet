"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Group, Loader, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { apiRequest, graphqlRequest } from "@/lib/api";
import { contentTypes } from "@/lib/domain";
import {
  QUEUE_ENQUEUE_REPROCESS_BATCH_MUTATION,
  QUEUE_PURGE_JOBS_MUTATION
} from "@/lib/graphql";
import {
  ALL_FILTER_OPTION,
  type AdminSettingsResponse
} from "./queue-page.helpers";

type TFunction = (key: string) => string;
type QueueAggregationItem = { value: string; label: string; count: number };
type ReloadQueue = () => void | Promise<void>;

type QueueModalProps = {
  t: TFunction;
  reload: ReloadQueue;
};

type QueuePurgeFormProps = QueueModalProps & {
  queueAggregationItems: QueueAggregationItem[];
};

function QueuePurgeForm({ t, reload, queueAggregationItems }: QueuePurgeFormProps) {
  const [taskQueue, setTaskQueue] = useState<string>(ALL_FILTER_OPTION);
  const [submitting, setSubmitting] = useState(false);
  const queueOptions = [
    { value: ALL_FILTER_OPTION, label: t("queue.purgeAllTypes") },
    ...queueAggregationItems.map((item) => ({ value: item.value, label: item.label }))
  ];

  const submit = async () => {
    setSubmitting(true);
    try {
      await graphqlRequest(QUEUE_PURGE_JOBS_MUTATION, {
        input: {
          queues: taskQueue === ALL_FILTER_OPTION ? undefined : [taskQueue]
        }
      });
      notifications.show({ color: "green", message: t("queue.purgeDone") });
      modals.closeAll();
      void reload();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack>
      <Text size="sm">{t("queue.purgeHint")}</Text>
      <Select
        label={t("queue.form.taskType")}
        allowDeselect={false}
        value={taskQueue}
        data={queueOptions}
        onChange={(value) => setTaskQueue(value || ALL_FILTER_OPTION)}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </Button>
        <Button color="red" onClick={() => void submit()} loading={submitting}>
          {t("queue.purge")}
        </Button>
      </Group>
    </Stack>
  );
}

function QueueCleanupSettingsForm({ t }: { t: TFunction }) {
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [maxRecords, setMaxRecords] = useState<number | "">(5000);
  const [maxAgeDays, setMaxAgeDays] = useState<number | "">(7);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      setLoadingSettings(true);
      try {
        const data = await apiRequest<AdminSettingsResponse>("/api/admin/settings");
        if (!mounted) return;
        setMaxRecords(data.settings.performance.queue.cleanupCompletedMaxRecords || 5000);
        setMaxAgeDays(data.settings.performance.queue.cleanupCompletedMaxAgeDays || 7);
      } catch (error) {
        if (!mounted) return;
        notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (mounted) setLoadingSettings(false);
      }
    };
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = async () => {
    if (typeof maxRecords !== "number" || typeof maxAgeDays !== "number") {
      notifications.show({ color: "red", message: t("queue.cleanupSettings.invalidInput") });
      return;
    }
    setSavingSettings(true);
    try {
      await apiRequest<AdminSettingsResponse>("/api/admin/settings", {
        method: "PUT",
        data: {
          performance: {
            queue: {
              cleanupCompletedMaxRecords: maxRecords,
              cleanupCompletedMaxAgeDays: maxAgeDays
            }
          }
        }
      });
      notifications.show({ color: "green", message: t("queue.cleanupSettings.saved") });
      modals.closeAll();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <Stack>
      <Text c="dimmed" size="sm">
        {t("queue.cleanupSettings.hint")}
      </Text>
      {loadingSettings ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <NumberInput
            label={t("queue.cleanupSettings.maxRecords")}
            min={100}
            max={1000000}
            value={maxRecords}
            onChange={(value) => setMaxRecords(value === "" ? "" : Number(value))}
          />
          <NumberInput
            label={t("queue.cleanupSettings.maxAgeDays")}
            min={1}
            max={3650}
            value={maxAgeDays}
            onChange={(value) => setMaxAgeDays(value === "" ? "" : Number(value))}
          />
        </SimpleGrid>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.closeAll()}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void submit()} loading={savingSettings} disabled={loadingSettings}>
          {t("settings.save")}
        </Button>
      </Group>
    </Stack>
  );
}

function QueueEnqueueForm({ t, reload }: QueueModalProps) {
  const [purge, setPurge] = useState(true);
  const [classifierRematch, setClassifierRematch] = useState(false);
  const [apisDisabled, setApisDisabled] = useState(true);
  const [localSearchDisabled, setLocalSearchDisabled] = useState(true);
  const [orphans, setOrphans] = useState(false);
  const [batchSize, setBatchSize] = useState<number | "">("");
  const [chunkSize, setChunkSize] = useState<number | "">("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const submit = async () => {
    try {
      await graphqlRequest(QUEUE_ENQUEUE_REPROCESS_BATCH_MUTATION, {
        input: {
          purge,
          classifierRematch,
          apisDisabled,
          localSearchDisabled,
          orphans: orphans || undefined,
          batchSize: typeof batchSize === "number" ? batchSize : undefined,
          chunkSize: typeof chunkSize === "number" ? chunkSize : undefined,
          contentTypes: selectedTypes.length ? selectedTypes : undefined
        }
      });
      modals.closeAll();
      notifications.show({ color: "green", message: t("queue.enqueueDone") });
      void reload();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Stack>
      <Text c="dimmed" size="sm">
        {t("queue.form.taskDescriptions.reprocessBatch")}
      </Text>

      <Checkbox label={t("queue.form.purge")} checked={purge} onChange={(e) => setPurge(e.currentTarget.checked)} />

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Checkbox label={t("queue.form.classifierRematch")} checked={classifierRematch} onChange={(e) => setClassifierRematch(e.currentTarget.checked)} />
        <Checkbox label={t("queue.form.apisDisabled")} checked={apisDisabled} onChange={(e) => setApisDisabled(e.currentTarget.checked)} />
        <Checkbox label={t("queue.form.localSearchDisabled")} checked={localSearchDisabled} onChange={(e) => setLocalSearchDisabled(e.currentTarget.checked)} />
        <Checkbox label={t("queue.form.orphans")} checked={orphans} onChange={(e) => setOrphans(e.currentTarget.checked)} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <NumberInput label={t("queue.form.batchSize")} min={1} value={batchSize} onChange={(value) => setBatchSize(value === "" ? "" : Number(value))} />
        <NumberInput label={t("queue.form.chunkSize")} min={1} value={chunkSize} onChange={(value) => setChunkSize(value === "" ? "" : Number(value))} />
      </SimpleGrid>
      <MultiSelect
        label={t("queue.form.contentTypes")}
        data={contentTypes.map((item) => ({ value: item, label: t(`contentTypes.${item}`) }))}
        value={selectedTypes}
        onChange={setSelectedTypes}
      />
      <Group justify="flex-end" className="modal-footer">
        <Button onClick={() => modals.closeAll()} variant="default">
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void submit()}>{t("queue.enqueue")}</Button>
      </Group>
    </Stack>
  );
}

export function openQueuePurgeModal(props: QueuePurgeFormProps) {
  modals.open({
    title: props.t("queue.purgeTitle"),
    children: <QueuePurgeForm {...props} />,
    size: 560
  });
}

export function openQueueCleanupSettingsModal(t: TFunction) {
  modals.open({
    title: t("queue.cleanupSettings.title"),
    children: <QueueCleanupSettingsForm t={t} />,
    size: 560
  });
}

export function openQueueEnqueueModal(props: QueueModalProps) {
  modals.open({
    title: props.t("queue.enqueueTitle"),
    children: <QueueEnqueueForm {...props} />,
    size: 680
  });
}

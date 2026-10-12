"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
  Textarea,
  Tooltip
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useI18n } from "@/languages/provider";
import {
  createAdminTopic,
  fetchMediaDetail,
  fetchMediaList,
  updateAdminTopic,
  type MediaDetailResponse,
  type MediaListItem,
  type MediaTopicAdminInput,
  type MediaTopicAdminItem
} from "@/lib/media-api";
import { getDisplayTitle } from "@/lib/media";

export type TopicEditor = MediaTopicAdminInput & { id?: string };

export function emptyTopicEditor(): TopicEditor {
  return { name: "", description: "", sortOrder: 100, mediaIds: [], enabled: true };
}

type TopicEditorModalProps = {
  opened: boolean;
  editor: TopicEditor | null;
  onChange: (editor: TopicEditor | null) => void;
  onClose: () => void;
  onSaved: (topic: MediaTopicAdminItem) => void;
};

function numberValue(value: string | number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

export function TopicEditorModal({
  opened,
  editor,
  onChange,
  onClose,
  onSaved
}: TopicEditorModalProps) {
  const { t, locale } = useI18n();
  const [media, setMedia] = useState<MediaListItem[]>([]);
  const [selectedMediaDetails, setSelectedMediaDetails] = useState<Record<string, MediaDetailResponse["item"]>>({});
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaCategory, setMediaCategory] = useState<"all" | "movie" | "series">("all");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaMembersExpanded, setMediaMembersExpanded] = useState(false);
  const [mediaMembersActivated, setMediaMembersActivated] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadMedia = useCallback(async (search: string, category: "all" | "movie" | "series") => {
    setMediaLoading(true);
    try {
      const result = await fetchMediaList({ search, category, sort: "popular", limit: 120, page: 1 });
      setMedia(result.items);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!opened || !mediaMembersExpanded) return;
    const timer = window.setTimeout(() => {
      void loadMedia(mediaSearch, mediaCategory);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadMedia, mediaCategory, mediaMembersExpanded, mediaSearch, opened]);

  useEffect(() => {
    if (!opened || !editor || !mediaMembersExpanded) return;
    const mediaIDs = (editor.mediaIds || []).filter((id) => !selectedMediaDetails[id]);
    if (mediaIDs.length === 0) return;

    let active = true;
    void Promise.allSettled(
      mediaIDs.map(async (id) => {
        const result = await fetchMediaDetail(id);
        return { id, item: result.item };
      })
    ).then((results) => {
      if (!active) return;
      setSelectedMediaDetails((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.item) {
            next[result.value.id] = result.value.item;
          }
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [editor, mediaMembersExpanded, opened, selectedMediaDetails]);

  useEffect(() => {
    if (!opened) return;
    setMedia([]);
    setSelectedMediaDetails({});
    setMediaSearch("");
    setMediaCategory("all");
    setMediaMembersExpanded(false);
    setMediaMembersActivated(false);
  }, [editor?.id, opened]);

  const save = async () => {
    if (!editor || !editor.name.trim()) {
      notifications.show({ color: "yellow", message: t("topics.manage.name") });
      return;
    }

    setSaving(true);
    try {
      const input: MediaTopicAdminInput = {
        name: editor.name.trim(),
        description: editor.description.trim(),
        sortOrder: editor.sortOrder,
        enabled: editor.enabled
      };
      if (mediaMembersActivated) {
        input.mediaIds = editor.mediaIds || [];
      }
      const result = editor.id
        ? await updateAdminTopic(editor.id, input)
        : await createAdminTopic(input);
      notifications.show({
        color: "green",
        message: editor.id ? t("topics.manage.updated") : t("topics.manage.created")
      });
      onClose();
      onSaved(result);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const mediaOptions = media.map((item) => ({
    value: item.id,
    label: mediaOptionLabel(item, locale)
  }));
  const selectedMediaOptions = (editor?.mediaIds || [])
    .filter((id) => !media.some((item) => item.id === id))
    .map((id) => ({
      value: id,
      label: selectedMediaDetails[id] ? mediaOptionLabel(selectedMediaDetails[id], locale) : id
    }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editor?.id ? t("topics.manage.edit") : t("topics.manage.create")}
      size="lg"
    >
      {editor ? (
        <Stack>
          <TextInput
            label={t("topics.manage.name")}
            value={editor.name}
            onChange={(event) => onChange({ ...editor, name: event.currentTarget.value })}
            required
          />
          <Textarea
            label={t("topics.manage.description")}
            value={editor.description}
            onChange={(event) => onChange({ ...editor, description: event.currentTarget.value })}
            minRows={3}
          />
          <NumberInput
            label={t("topics.manage.sortWeight")}
            value={editor.sortOrder}
            min={-100000}
            max={100000}
            onChange={(value) => onChange({ ...editor, sortOrder: numberValue(value) })}
          />
          <Button
            variant="default"
            leftSection={mediaMembersExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            onClick={() => {
              setMediaMembersExpanded((expanded) => !expanded);
              setMediaMembersActivated(true);
            }}
          >
            {t("topics.manage.media")} ({(editor.mediaIds || []).length})
          </Button>
          {mediaMembersExpanded ? (
            <>
              <Divider />
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label={t("topics.manage.mediaSearch")}
                  placeholder={t("topics.manage.mediaPlaceholder")}
                  value={mediaSearch}
                  onChange={(event) => setMediaSearch(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadMedia(mediaSearch, mediaCategory);
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <Select
                  label={t("topics.manage.mediaType")}
                  data={[
                    { value: "all", label: t("topics.manage.mediaTypes.all") },
                    { value: "movie", label: t("topics.manage.mediaTypes.movie") },
                    { value: "series", label: t("topics.manage.mediaTypes.series") }
                  ]}
                  value={mediaCategory}
                  onChange={(value) => setMediaCategory((value as "all" | "movie" | "series") || "all")}
                  w={140}
                />
                <Tooltip label={t("nav.search")} withArrow>
                  <ActionIcon
                    className="app-icon-btn"
                    variant="default"
                    size="lg"
                    aria-label={t("nav.search")}
                    loading={mediaLoading}
                    onClick={() => void loadMedia(mediaSearch, mediaCategory)}
                  >
                    <Search size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <MultiSelect
                label={t("topics.manage.media")}
                placeholder={t("topics.manage.mediaPlaceholder")}
                data={[...mediaOptions, ...selectedMediaOptions]}
                value={editor.mediaIds || []}
                onChange={(mediaIds) => onChange({ ...editor, mediaIds })}
                searchable
                clearable
                maxDropdownHeight={280}
                styles={{
                  pillsList: {
                    maxHeight: 180,
                    overflowY: "auto",
                    alignContent: "flex-start"
                  }
                }}
              />
            </>
          ) : null}
          <Switch
            label={t("topics.manage.enabled")}
            checked={editor.enabled}
            onChange={(event) => onChange({ ...editor, enabled: event.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>{t("common.cancel")}</Button>
            <Button loading={saving} onClick={() => void save()}>{t("topics.manage.save")}</Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

function mediaOptionLabel(item: MediaListItem | MediaDetailResponse["item"], locale: string): string {
  return getDisplayTitle(item, locale === "en" ? "en" : "zh") || item.title || item.id;
}

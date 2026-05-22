"use client";

import { useCallback, useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "@/lib/api";
import type {
  SubtitleTemplate,
  SubtitleTemplateForm,
  SubtitleTemplateResponse,
  SubtitleTemplatesResponse
} from "./settings-page.types";

type Translate = (key: string, ...args: unknown[]) => string;

export function useSubtitleTemplatesController({
  isAdmin,
  t
}: {
  isAdmin: boolean;
  t: Translate;
}) {
  const [subtitleTemplates, setSubtitleTemplates] = useState<SubtitleTemplate[]>([]);
  const [subtitleTemplatesLoading, setSubtitleTemplatesLoading] = useState(false);
  const [subtitleTemplateDeleting, setSubtitleTemplateDeleting] = useState<Record<string, boolean>>({});
  const [subtitleModalOpened, setSubtitleModalOpened] = useState(false);
  const [subtitleModalSaving, setSubtitleModalSaving] = useState(false);
  const [subtitleModalMode, setSubtitleModalMode] = useState<"create" | "edit">("create");
  const [subtitleEditingId, setSubtitleEditingId] = useState<string | null>(null);
  const [subtitleForm, setSubtitleForm] = useState<SubtitleTemplateForm>({
    name: "",
    urlTemplate: "https://subhd.tv/search/{title}",
    enabled: true
  });

  const loadSubtitleTemplates = useCallback(async () => {
    if (!isAdmin) return;
    setSubtitleTemplatesLoading(true);
    try {
      const data = await apiRequest<SubtitleTemplatesResponse>("/api/admin/settings/subtitle-templates");
      setSubtitleTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleTemplatesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadSubtitleTemplates();
  }, [isAdmin, loadSubtitleTemplates]);

  const deleteSubtitleTemplate = useCallback(async (id: string) => {
    setSubtitleTemplateDeleting((current) => ({ ...current, [id]: true }));
    try {
      await apiRequest(`/api/admin/settings/subtitle-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSubtitleTemplates((current) => current.filter((item) => item.id !== id));
      notifications.show({ color: "green", message: t("settings.subtitleTemplateDeleted") });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleTemplateDeleting((current) => ({ ...current, [id]: false }));
    }
  }, [t]);

  const openCreateSubtitleModal = useCallback(() => {
    setSubtitleModalMode("create");
    setSubtitleEditingId(null);
    setSubtitleForm({
      name: "",
      urlTemplate: "https://subhd.tv/search/{title}",
      enabled: true
    });
    setSubtitleModalOpened(true);
  }, []);

  const openEditSubtitleModal = useCallback((template: SubtitleTemplate) => {
    setSubtitleModalMode("edit");
    setSubtitleEditingId(template.id);
    setSubtitleForm({
      name: template.name,
      urlTemplate: template.urlTemplate,
      enabled: template.enabled
    });
    setSubtitleModalOpened(true);
  }, []);

  const closeSubtitleModal = useCallback(() => {
    if (!subtitleModalSaving) {
      setSubtitleModalOpened(false);
    }
  }, [subtitleModalSaving]);

  const submitSubtitleModal = useCallback(async () => {
    setSubtitleModalSaving(true);
    try {
      const payload = {
        name: subtitleForm.name,
        urlTemplate: subtitleForm.urlTemplate,
        enabled: subtitleForm.enabled
      };

      if (subtitleModalMode === "create") {
        const data = await apiRequest<SubtitleTemplateResponse>("/api/admin/settings/subtitle-templates", {
          method: "POST",
          data: payload
        });
        setSubtitleTemplates((current) => [...current, data.template]);
        notifications.show({ color: "green", message: t("settings.subtitleTemplateCreated") });
      } else {
        const templateId = subtitleEditingId || "";
        if (!templateId) {
          throw new Error(t("settings.subtitleTemplateEditTargetMissing"));
        }
        const data = await apiRequest<SubtitleTemplateResponse>(
          `/api/admin/settings/subtitle-templates/${encodeURIComponent(templateId)}`,
          { method: "PUT", data: payload }
        );
        setSubtitleTemplates((current) => current.map((item) => (item.id === templateId ? data.template : item)));
        notifications.show({ color: "green", message: t("settings.subtitleTemplateSaved") });
      }

      setSubtitleModalOpened(false);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubtitleModalSaving(false);
    }
  }, [subtitleEditingId, subtitleForm, subtitleModalMode, t]);

  return {
    subtitleTemplates,
    subtitleTemplatesLoading,
    subtitleTemplateDeleting,
    subtitleModalOpened,
    subtitleModalSaving,
    subtitleModalMode,
    subtitleForm,
    setSubtitleForm,
    loadSubtitleTemplates,
    deleteSubtitleTemplate,
    openCreateSubtitleModal,
    openEditSubtitleModal,
    closeSubtitleModal,
    submitSubtitleModal
  };
}

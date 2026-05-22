"use client";

import { Button, Group, Modal, Stack, Switch, TextInput } from "@mantine/core";
import type { SubtitleTemplateForm } from "./settings-page.types";

type TFunction = (key: string) => string;

type SettingsPageSubtitleModalProps = {
  t: TFunction;
  opened: boolean;
  saving: boolean;
  mode: "create" | "edit";
  form: SubtitleTemplateForm;
  onClose: () => void;
  onSubmit: () => void;
  onChangeForm: (updater: (current: SubtitleTemplateForm) => SubtitleTemplateForm) => void;
};

export function SettingsPageSubtitleModal({
  t,
  opened,
  saving,
  mode,
  form,
  onClose,
  onSubmit,
  onChangeForm
}: SettingsPageSubtitleModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mode === "create" ? t("settings.subtitleTemplateCreate") : t("settings.subtitleTemplateEdit")}
      centered
    >
      <Stack gap="sm">
        <TextInput
          label={t("settings.subtitleTemplateName")}
          placeholder={t("settings.subtitleTemplateNamePlaceholder")}
          value={form.name}
          onChange={(event) => onChangeForm((current) => ({ ...current, name: event.currentTarget.value }))}
        />
        <TextInput
          label={t("settings.subtitleTemplateURL")}
          placeholder="https://subhd.tv/search/{title}"
          value={form.urlTemplate}
          onChange={(event) => onChangeForm((current) => ({ ...current, urlTemplate: event.currentTarget.value }))}
        />
        <Switch
          label={t("settings.subtitleTemplateEnabled")}
          checked={form.enabled}
          onChange={(event) => onChangeForm((current) => ({ ...current, enabled: event.currentTarget.checked }))}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button loading={saving} onClick={onSubmit}>
            {mode === "create" ? t("settings.subtitleTemplateAdd") : t("settings.subtitleTemplateSave")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

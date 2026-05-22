"use client";

import { Button, Group, Modal, PasswordInput, Select, Stack, TextInput } from "@mantine/core";
import type { UserFormState } from "./users-page.helpers";

type UserEditorModalProps = {
  t: (key: string) => string;
  opened: boolean;
  mode: "create" | "edit";
  saving: boolean;
  form: UserFormState;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (value: UserFormState | ((current: UserFormState) => UserFormState)) => void;
};

export function UserEditorModal({
  t,
  opened,
  mode,
  saving,
  form,
  onClose,
  onSubmit,
  onChange
}: UserEditorModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mode === "create" ? t("users.userEditorCreateTitle") : t("users.userEditorEditTitle")}
      centered
    >
      <Stack gap="sm">
        <TextInput
          label={t("users.userUsername")}
          value={form.username}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange((current) => ({ ...current, username: value }));
          }}
        />
        <PasswordInput
          label={mode === "create" ? t("users.userPassword") : t("users.userPasswordOptional")}
          value={form.password}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange((current) => ({ ...current, password: value }));
          }}
        />
        <Select
          label={t("users.userRole")}
          value={form.role}
          allowDeselect={false}
          data={[
            { value: "user", label: "user" },
            { value: "admin", label: "admin" }
          ]}
          onChange={(value) => onChange((current) => ({ ...current, role: (value as "admin" | "user") || "user" }))}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            {t("users.userSave")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

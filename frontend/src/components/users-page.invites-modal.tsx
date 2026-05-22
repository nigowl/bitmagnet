"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { InviteBatchOptions, InviteFormState, InviteItem } from "./users-page.helpers";
import { DEFAULT_INVITE_FORM, formatDate } from "./users-page.helpers";

type Translate = (key: string) => string;

type InviteManagerModalsProps = {
  t: Translate;
  modalOpened: boolean;
  invites: InviteItem[];
  invitesLoading: boolean;
  inviteDeleting: Record<number, boolean>;
  inviteEditorOpened: boolean;
  inviteEditorMode: "create" | "edit";
  inviteSaving: boolean;
  inviteForm: InviteFormState;
  inviteBatchModalOpened: boolean;
  inviteBatchSubmitting: boolean;
  batchCount: number;
  batchLength: number;
  batchPrefix: string;
  batchOptions: InviteBatchOptions;
  batchCreatedItems: InviteItem[];
  inviteDeleteTarget: InviteItem | null;
  onCloseModal: () => void;
  onLoadInvites: () => void;
  onOpenCreateInviteEditor: () => void;
  onOpenEditInviteEditor: (item: InviteItem) => void;
  onOpenInviteBatchModal: () => void;
  onSetInviteDeleteTarget: (item: InviteItem | null) => void;
  onCloseInviteEditor: () => void;
  onSubmitInvite: () => void;
  onChangeInviteForm: (value: InviteFormState | ((current: InviteFormState) => InviteFormState)) => void;
  onCloseInviteBatchModal: () => void;
  onBatchCreate: () => void;
  onChangeBatchCount: (value: number) => void;
  onChangeBatchLength: (value: number) => void;
  onChangeBatchPrefix: (value: string) => void;
  onChangeBatchOptions: (value: InviteBatchOptions | ((current: InviteBatchOptions) => InviteBatchOptions)) => void;
  onConfirmInviteDelete: (item: InviteItem) => void;
};

export function InviteManagerModals({
  t,
  modalOpened,
  invites,
  invitesLoading,
  inviteDeleting,
  inviteEditorOpened,
  inviteEditorMode,
  inviteSaving,
  inviteForm,
  inviteBatchModalOpened,
  inviteBatchSubmitting,
  batchCount,
  batchLength,
  batchPrefix,
  batchOptions,
  batchCreatedItems,
  inviteDeleteTarget,
  onCloseModal,
  onLoadInvites,
  onOpenCreateInviteEditor,
  onOpenEditInviteEditor,
  onOpenInviteBatchModal,
  onSetInviteDeleteTarget,
  onCloseInviteEditor,
  onSubmitInvite,
  onChangeInviteForm,
  onCloseInviteBatchModal,
  onBatchCreate,
  onChangeBatchCount,
  onChangeBatchLength,
  onChangeBatchPrefix,
  onChangeBatchOptions,
  onConfirmInviteDelete
}: InviteManagerModalsProps) {
  const inviteStats = {
    total: invites.length,
    enabled: invites.filter((item) => item.enabled).length
  };

  return (
    <>
      <Modal opened={modalOpened} onClose={onCloseModal} title={t("users.inviteTitle")} size="xl">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={4}>
              <Text c="dimmed" size="sm">{t("users.inviteHint")}</Text>
              <Group gap={8}>
                <Badge variant="light">{t("common.total")}: {inviteStats.total}</Badge>
                <Badge variant="outline">{t("users.inviteEnabled")}: {inviteStats.enabled}</Badge>
              </Group>
            </Stack>
            <Group gap={8}>
              <Tooltip label={t("users.refreshInvites")}>
                <ActionIcon
                  className="app-icon-btn spin-on-active"
                  data-spinning={invitesLoading ? "true" : "false"}
                  size="lg"
                  variant="default"
                  loading={invitesLoading}
                  onClick={onLoadInvites}
                >
                  <RefreshCw size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("users.createInvite")}>
                <ActionIcon className="app-icon-btn" size="lg" variant="default" onClick={onOpenCreateInviteEditor}>
                  <Plus size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("users.batchCreateInvite")}>
                <ActionIcon className="app-icon-btn" size="lg" variant="light" color="orange" onClick={onOpenInviteBatchModal}>
                  <KeyRound size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {invitesLoading ? (
            <Group justify="center" py="md"><Loader size="sm" /></Group>
          ) : invites.length === 0 ? (
            <Text c="dimmed">{t("users.emptyInvites")}</Text>
          ) : (
            <ScrollArea type="auto" scrollbarSize={8}>
              <Table striped withTableBorder highlightOnHover miw={1080}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>{t("users.inviteCode")}</Table.Th>
                    <Table.Th>{t("users.inviteNote")}</Table.Th>
                    <Table.Th>{t("users.inviteUsedCount")}</Table.Th>
                    <Table.Th>{t("users.inviteMaxUses")}</Table.Th>
                    <Table.Th>{t("users.inviteEnabled")}</Table.Th>
                    <Table.Th>{t("users.inviteExpiresAt")}</Table.Th>
                    <Table.Th>{t("users.inviteActions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invites.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{item.id}</Table.Td>
                      <Table.Td><Text ff="monospace">{item.code}</Text></Table.Td>
                      <Table.Td>{item.note || "-"}</Table.Td>
                      <Table.Td>{item.usedCount}</Table.Td>
                      <Table.Td>{item.maxUses}</Table.Td>
                      <Table.Td>{item.enabled ? t("common.yes") : t("common.no")}</Table.Td>
                      <Table.Td>{formatDate(item.expiresAt)}</Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <ActionIcon className="app-icon-btn" variant="default" size="sm" onClick={() => onOpenEditInviteEditor(item)}>
                            <Pencil size={13} />
                          </ActionIcon>
                          <ActionIcon
                            className="app-icon-btn"
                            variant="light"
                            color="red"
                            size="sm"
                            loading={Boolean(inviteDeleting[item.id])}
                            onClick={() => onSetInviteDeleteTarget(item)}
                          >
                            <Trash2 size={13} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={inviteEditorOpened}
        onClose={onCloseInviteEditor}
        title={inviteEditorMode === "edit" ? t("users.inviteEditorEditTitle") : t("users.inviteEditorCreateTitle")}
        centered
      >
        <Stack gap="sm">
          <InviteFormFields
            t={t}
            form={inviteForm}
            onChange={onChangeInviteForm}
            codeEditable={inviteEditorMode !== "edit"}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCloseInviteEditor} disabled={inviteSaving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onSubmitInvite} loading={inviteSaving}>
              {t("users.inviteSave")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={inviteBatchModalOpened}
        onClose={onCloseInviteBatchModal}
        title={t("users.inviteBatchModalTitle")}
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text c="dimmed" size="sm">{t("users.inviteBatchModalHint")}</Text>
          <NumberInput label={t("users.inviteBatchCount")} min={1} max={200} value={batchCount} onChange={(v) => onChangeBatchCount(Number(v) || 1)} />
          <NumberInput label={t("users.inviteBatchLength")} min={6} max={32} value={batchLength} onChange={(v) => onChangeBatchLength(Number(v) || 10)} />
          <TextInput label={t("users.inviteBatchPrefix")} value={batchPrefix} onChange={(e) => onChangeBatchPrefix(e.currentTarget.value)} />
          <TextInput
            label={t("users.inviteNote")}
            value={batchOptions.note}
            onChange={(event) => onChangeBatchOptions((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <NumberInput
            label={t("users.inviteMaxUses")}
            min={0}
            max={999999}
            value={batchOptions.maxUses}
            onChange={(value) => onChangeBatchOptions((current) => ({ ...current, maxUses: Number(value) || 0 }))}
          />
          <TextInput
            label={t("users.inviteExpiresAt")}
            placeholder="2026-04-04T12:00"
            value={batchOptions.expiresAt}
            onChange={(event) => onChangeBatchOptions((current) => ({ ...current, expiresAt: event.currentTarget.value }))}
          />
          <Switch
            label={t("users.inviteEnabled")}
            checked={batchOptions.enabled}
            onChange={(event) => onChangeBatchOptions((current) => ({ ...current, enabled: event.currentTarget.checked }))}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCloseInviteBatchModal} disabled={inviteBatchSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onBatchCreate} loading={inviteBatchSubmitting}>
              {t("users.inviteBatchConfirm")}
            </Button>
          </Group>
          {batchCreatedItems.length > 0 ? (
            <Card withBorder radius="md">
              <Stack gap={8}>
                <Text fw={600}>{t("users.inviteBatchResultTitle")}</Text>
                <ScrollArea type="auto" scrollbarSize={8}>
                  <Table striped withTableBorder highlightOnHover miw={760}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID #</Table.Th>
                        <Table.Th>{t("users.inviteCode")}</Table.Th>
                        <Table.Th>{t("users.inviteNote")}</Table.Th>
                        <Table.Th>{t("users.inviteMaxUses")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {batchCreatedItems.map((item) => (
                        <Table.Tr key={item.id}>
                          <Table.Td>{item.id}</Table.Td>
                          <Table.Td><Text ff="monospace">{item.code}</Text></Table.Td>
                          <Table.Td>{item.note || "-"}</Table.Td>
                          <Table.Td>{item.maxUses}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(inviteDeleteTarget)}
        onClose={() => onSetInviteDeleteTarget(null)}
        title={t("users.inviteDeleteConfirmTitle")}
        centered
      >
        <Stack gap="sm">
          <Text size="sm">{t("users.inviteDeleteConfirmHint")}</Text>
          <Text size="sm" ff="monospace">
            {inviteDeleteTarget?.code || "-"}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => onSetInviteDeleteTarget(null)}
              disabled={Boolean(inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id])}
            >
              {t("common.cancel")}
            </Button>
            <Button
              color="red"
              loading={Boolean(inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id])}
              onClick={() => {
                if (inviteDeleteTarget) {
                  onConfirmInviteDelete(inviteDeleteTarget);
                }
              }}
            >
              {t("users.inviteDelete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function InviteFormFields({
  t,
  form,
  onChange,
  codeEditable
}: {
  t: Translate;
  form: InviteFormState;
  onChange: (value: InviteFormState | ((current: InviteFormState) => InviteFormState)) => void;
  codeEditable: boolean;
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <TextInput
          style={{ flex: 1 }}
          label={t("users.inviteCodeOptional")}
          value={form.code}
          disabled={!codeEditable}
          onChange={(event) => onChange((current) => ({ ...current, code: event.currentTarget.value }))}
        />
        {codeEditable ? (
          <Button size="xs" variant="default" onClick={() => onChange((current) => ({ ...current, code: DEFAULT_INVITE_FORM.code }))}>
            {t("users.inviteAutoGenerate")}
          </Button>
        ) : null}
      </Group>
      <Stack gap="sm">
        <TextInput label={t("users.inviteNote")} value={form.note} onChange={(event) => onChange((current) => ({ ...current, note: event.currentTarget.value }))} />
        <NumberInput
          label={t("users.inviteMaxUses")}
          min={0}
          max={999999}
          value={form.maxUses}
          onChange={(value) => onChange((current) => ({ ...current, maxUses: Number(value) || 0 }))}
        />
        <TextInput
          label={t("users.inviteExpiresAt")}
          placeholder="2026-04-04T12:00"
          value={form.expiresAt}
          onChange={(event) => onChange((current) => ({ ...current, expiresAt: event.currentTarget.value }))}
        />
        <Switch
          label={t("users.inviteEnabled")}
          checked={form.enabled}
          onChange={(event) => onChange((current) => ({ ...current, enabled: event.currentTarget.checked }))}
        />
      </Stack>
    </Stack>
  );
}

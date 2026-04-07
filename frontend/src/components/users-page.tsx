"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { KeyRound, LogIn, Pencil, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import { apiRequest } from "@/lib/api";

type AdminUserItem = {
  id: number;
  username: string;
  role: "admin" | "user";
  createdAt: string;
  inviteCodeId?: number | null;
  inviteCode?: string;
  inviteCodeUsedAt?: string | null;
  inviteNote?: string;
};

type InviteItem = {
  id: number;
  code: string;
  note: string;
  maxUses: number;
  usedCount: number;
  enabled: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type UsersResponse = { items: AdminUserItem[] };
type UserResponse = { user: AdminUserItem };
type InvitesResponse = { items: InviteItem[] };
type InviteBatchResponse = { items: InviteItem[] };

type InviteFormState = {
  code: string;
  note: string;
  maxUses: number;
  enabled: boolean;
  expiresAt: string;
};

type InviteBatchOptions = {
  note: string;
  maxUses: number;
  enabled: boolean;
  expiresAt: string;
};

type UserFormState = {
  username: string;
  password: string;
  role: "admin" | "user";
};

const usernamePattern = /^[a-zA-Z0-9._-]{3,32}$/;

const DEFAULT_INVITE_FORM: InviteFormState = {
  code: "",
  note: "",
  maxUses: 1,
  enabled: true,
  expiresAt: ""
};

function toISODateTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function formatDate(raw?: string | null): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function UsersPage() {
  const { t } = useI18n();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { openLogin } = useAuthDialog();

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userEditorOpened, setUserEditorOpened] = useState(false);
  const [userEditorMode, setUserEditorMode] = useState<"create" | "edit">("create");
  const [userSaving, setUserSaving] = useState(false);
  const [userEditingId, setUserEditingId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({
    username: "",
    password: "",
    role: "user"
  });

  const [inviteModalOpened, setInviteModalOpened] = useState(false);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteDeleting, setInviteDeleting] = useState<Record<number, boolean>>({});
  const [inviteEditorOpened, setInviteEditorOpened] = useState(false);
  const [inviteEditorMode, setInviteEditorMode] = useState<"create" | "edit">("create");
  const [inviteBatchModalOpened, setInviteBatchModalOpened] = useState(false);
  const [inviteBatchSubmitting, setInviteBatchSubmitting] = useState(false);
  const [batchCreatedItems, setBatchCreatedItems] = useState<InviteItem[]>([]);
  const [inviteDeleteTarget, setInviteDeleteTarget] = useState<InviteItem | null>(null);
  const [inviteEditingId, setInviteEditingId] = useState<number | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({ ...DEFAULT_INVITE_FORM });
  const [batchOptions, setBatchOptions] = useState<InviteBatchOptions>({
    note: "",
    maxUses: 1,
    enabled: true,
    expiresAt: ""
  });

  const [batchCount, setBatchCount] = useState(10);
  const [batchLength, setBatchLength] = useState(10);
  const [batchPrefix, setBatchPrefix] = useState("");

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const data = await apiRequest<UsersResponse>("/api/admin/users");
      setUsers(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  const loadInvites = useCallback(async () => {
    if (!isAdmin) return;
    setInvitesLoading(true);
    try {
      const data = await apiRequest<InvitesResponse>("/api/admin/invites");
      setInvites(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setInvitesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUsers();
  }, [isAdmin, loadUsers]);

  const openInviteModal = async () => {
    setInviteModalOpened(true);
    setInviteEditorOpened(false);
    setInviteBatchModalOpened(false);
    setInviteEditingId(null);
    setBatchCreatedItems([]);
    await loadInvites();
  };

  const closeInviteModal = () => {
    setInviteModalOpened(false);
    setInviteEditorOpened(false);
    setInviteBatchModalOpened(false);
    setInviteDeleteTarget(null);
  };

  const resetInviteForm = () => {
    setInviteEditingId(null);
    setInviteForm({ ...DEFAULT_INVITE_FORM });
  };

  const openCreateInviteEditor = () => {
    setInviteEditorMode("create");
    resetInviteForm();
    setInviteEditorOpened(true);
  };

  const openEditInviteEditor = (item: InviteItem) => {
    setInviteEditorMode("edit");
    setInviteEditingId(item.id);
    setInviteForm({
      code: item.code,
      note: item.note || "",
      maxUses: item.maxUses,
      enabled: item.enabled,
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 16) : ""
    });
    setInviteEditorOpened(true);
  };

  const closeInviteEditor = () => {
    if (inviteSaving) return;
    setInviteEditorOpened(false);
    resetInviteForm();
  };

  const openInviteBatchModal = () => {
    setInviteBatchModalOpened(true);
    setBatchCreatedItems([]);
  };

  const submitInvite = async () => {
    setInviteSaving(true);
    try {
      const payloadBase = {
        note: inviteForm.note.trim(),
        maxUses: Math.max(0, Math.trunc(inviteForm.maxUses || 0)),
        enabled: inviteForm.enabled,
        expiresAt: toISODateTime(inviteForm.expiresAt)
      };
      if (inviteEditorMode === "edit" && inviteEditingId) {
        await apiRequest(`/api/admin/invites/${inviteEditingId}`, { method: "PUT", data: payloadBase });
        notifications.show({ color: "green", message: t("users.inviteUpdated") });
      } else {
        const payloadCreate = {
          ...payloadBase,
          code: inviteForm.code.trim()
        };
        await apiRequest("/api/admin/invites", { method: "POST", data: payloadCreate });
        notifications.show({ color: "green", message: t("users.inviteCreated") });
      }
      setInviteEditorOpened(false);
      resetInviteForm();
      await loadInvites();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setInviteSaving(false);
    }
  };

  const deleteInvite = async (id: number) => {
    setInviteDeleting((current) => ({ ...current, [id]: true }));
    try {
      await apiRequest(`/api/admin/invites/${id}`, { method: "DELETE" });
      notifications.show({ color: "green", message: t("users.inviteDeleted") });
      await loadInvites();
      await loadUsers();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setInviteDeleting((current) => ({ ...current, [id]: false }));
    }
  };

  const batchCreate = async () => {
    setInviteBatchSubmitting(true);
    try {
      const result = await apiRequest<InviteBatchResponse>("/api/admin/invites/batch", {
        method: "POST",
        data: {
          count: Math.max(1, Math.trunc(batchCount || 1)),
          length: Math.max(6, Math.trunc(batchLength || 6)),
          prefix: batchPrefix.trim(),
          note: batchOptions.note.trim(),
          maxUses: Math.max(0, Math.trunc(batchOptions.maxUses || 0)),
          enabled: batchOptions.enabled,
          expiresAt: toISODateTime(batchOptions.expiresAt)
        }
      });
      setBatchCreatedItems(Array.isArray(result.items) ? result.items : []);
      notifications.show({ color: "green", message: t("users.inviteBatchDone") });
      await loadInvites();
      await loadUsers();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setInviteBatchSubmitting(false);
    }
  };

  const inviteStats = useMemo(() => {
    const enabled = invites.filter((item) => item.enabled).length;
    return { total: invites.length, enabled };
  }, [invites]);

  const resetUserForm = useCallback(() => {
    setUserEditingId(null);
    setUserForm({
      username: "",
      password: "",
      role: "user"
    });
  }, []);

  const openCreateUserEditor = useCallback(() => {
    setUserEditorMode("create");
    resetUserForm();
    setUserEditorOpened(true);
  }, [resetUserForm]);

  const openEditUserEditor = useCallback((item: AdminUserItem) => {
    setUserEditorMode("edit");
    setUserEditingId(item.id);
    setUserForm({
      username: item.username,
      password: "",
      role: item.role
    });
    setUserEditorOpened(true);
  }, []);

  const closeUserEditor = useCallback(() => {
    if (userSaving) return;
    setUserEditorOpened(false);
    resetUserForm();
  }, [resetUserForm, userSaving]);

  const submitUserEditor = useCallback(async () => {
    const normalizedUsername = userForm.username.trim();
    if (!usernamePattern.test(normalizedUsername)) {
      notifications.show({ color: "yellow", message: t("users.userUsernameInvalid") });
      return;
    }

    const normalizedPassword = userForm.password.trim();
    if (userEditorMode === "create" && !normalizedPassword) {
      notifications.show({ color: "yellow", message: t("users.userPasswordRequired") });
      return;
    }
    if (normalizedPassword && normalizedPassword.length < 8) {
      notifications.show({ color: "yellow", message: t("users.userPasswordMinLength") });
      return;
    }

    setUserSaving(true);
    try {
      if (userEditorMode === "create") {
        const data = await apiRequest<UserResponse>("/api/admin/users", {
          method: "POST",
          data: {
            username: normalizedUsername,
            password: normalizedPassword,
            role: userForm.role
          }
        });
        setUsers((current) => [data.user, ...current]);
        notifications.show({ color: "green", message: t("users.userCreated") });
      } else {
        if (!userEditingId) {
          throw new Error(t("users.userEditTargetMissing"));
        }
        const payload: Record<string, string> = {
          username: normalizedUsername,
          role: userForm.role
        };
        if (normalizedPassword) {
          payload.password = normalizedPassword;
        }
        const data = await apiRequest<UserResponse>(`/api/admin/users/${userEditingId}`, {
          method: "PUT",
          data: payload
        });
        setUsers((current) => current.map((item) => (item.id === userEditingId ? data.user : item)));
        notifications.show({ color: "green", message: t("users.userUpdated") });
      }
      setUserEditorOpened(false);
      resetUserForm();
      await loadUsers();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setUserSaving(false);
    }
  }, [loadUsers, resetUserForm, t, userEditingId, userEditorMode, userForm.password, userForm.role, userForm.username]);

  if (authLoading) {
    return (
      <Card className="glass-card" withBorder>
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Card>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Card className="glass-card" withBorder maw={560} mx="auto">
        <Stack>
          <Title order={2}>{t("auth.adminOnly")}</Title>
          <Text c="dimmed">{t("auth.adminOnlyDesc")}</Text>
          <Button leftSection={<LogIn size={15} />} w="fit-content" onClick={openLogin}>
            {t("auth.login")}
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card className="glass-card" withBorder>
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={4}>
            <Title order={2}>{t("users.title")}</Title>
            <Text c="dimmed" className="page-subtitle">{t("users.subtitle")}</Text>
          </Stack>
          <Group gap="xs">
            <Button variant="default" leftSection={<RefreshCw size={14} />} loading={usersLoading} onClick={() => void loadUsers()}>
              {t("users.refreshUsers")}
            </Button>
            <Tooltip label={t("users.createUser")}>
              <ActionIcon className="app-icon-btn" size="lg" variant="default" onClick={openCreateUserEditor}>
                <UserPlus size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("users.inviteManage")}>
              <ActionIcon className="app-icon-btn" size="lg" variant="light" color="orange" onClick={() => void openInviteModal()}>
                <KeyRound size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      <Card className="glass-card" withBorder>
        {usersLoading ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : users.length === 0 ? (
          <Text c="dimmed">{t("users.emptyUsers")}</Text>
        ) : (
          <ScrollArea type="auto" scrollbarSize={8}>
            <Table striped withTableBorder highlightOnHover miw={980}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>{t("users.userUsername")}</Table.Th>
                  <Table.Th>{t("users.userRole")}</Table.Th>
                  <Table.Th>{t("users.userCreatedAt")}</Table.Th>
                  <Table.Th>{t("users.userInviteCode")}</Table.Th>
                  <Table.Th>{t("users.userInviteUsedAt")}</Table.Th>
                  <Table.Th>{t("users.userInviteNote")}</Table.Th>
                  <Table.Th>{t("users.userActions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.id}</Table.Td>
                    <Table.Td>{item.username}</Table.Td>
                    <Table.Td><Badge variant="light">{item.role}</Badge></Table.Td>
                    <Table.Td>{formatDate(item.createdAt)}</Table.Td>
                    <Table.Td>{item.inviteCode?.trim() || "-"}</Table.Td>
                    <Table.Td>{formatDate(item.inviteCodeUsedAt)}</Table.Td>
                    <Table.Td>{item.inviteNote?.trim() || "-"}</Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <ActionIcon className="app-icon-btn" variant="default" size="sm" onClick={() => openEditUserEditor(item)}>
                          <Pencil size={13} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Card>

      <Modal
        opened={userEditorOpened}
        onClose={closeUserEditor}
        title={userEditorMode === "create" ? t("users.userEditorCreateTitle") : t("users.userEditorEditTitle")}
        centered
      >
        <Stack gap="sm">
          <TextInput
            label={t("users.userUsername")}
            value={userForm.username}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setUserForm((current) => ({ ...current, username: value }));
            }}
          />
          <PasswordInput
            label={userEditorMode === "create" ? t("users.userPassword") : t("users.userPasswordOptional")}
            value={userForm.password}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setUserForm((current) => ({ ...current, password: value }));
            }}
          />
          <Select
            label={t("users.userRole")}
            value={userForm.role}
            allowDeselect={false}
            data={[
              { value: "user", label: "user" },
              { value: "admin", label: "admin" }
            ]}
            onChange={(value) => setUserForm((current) => ({ ...current, role: (value as "admin" | "user") || "user" }))}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUserEditor} disabled={userSaving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitUserEditor()} loading={userSaving}>
              {t("users.userSave")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={inviteModalOpened} onClose={closeInviteModal} title={t("users.inviteTitle")} size="xl">
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
                  onClick={() => void loadInvites()}
                >
                  <RefreshCw size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("users.createInvite")}>
                <ActionIcon className="app-icon-btn" size="lg" variant="default" onClick={openCreateInviteEditor}>
                  <Plus size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("users.batchCreateInvite")}>
                <ActionIcon className="app-icon-btn" size="lg" variant="light" color="orange" onClick={openInviteBatchModal}>
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
                          <ActionIcon
                            className="app-icon-btn"
                            variant="default"
                            size="sm"
                            onClick={() => openEditInviteEditor(item)}
                          >
                            <Pencil size={13} />
                          </ActionIcon>
                          <ActionIcon
                            className="app-icon-btn"
                            variant="light"
                            color="red"
                            size="sm"
                            loading={Boolean(inviteDeleting[item.id])}
                            onClick={() => setInviteDeleteTarget(item)}
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
        onClose={closeInviteEditor}
        title={inviteEditorMode === "edit" ? t("users.inviteEditorEditTitle") : t("users.inviteEditorCreateTitle")}
        centered
      >
        <Stack gap="sm">
          <InviteFormFields
            t={t}
            form={inviteForm}
            onChange={setInviteForm}
            codeEditable={inviteEditorMode !== "edit"}
            onAutoGenerate={() => {
              setInviteForm((current) => ({ ...current, code: "" }));
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeInviteEditor} disabled={inviteSaving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitInvite()} loading={inviteSaving}>
              {t("users.inviteSave")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={inviteBatchModalOpened}
        onClose={() => {
          if (inviteBatchSubmitting) return;
          setInviteBatchModalOpened(false);
        }}
        title={t("users.inviteBatchModalTitle")}
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text c="dimmed" size="sm">{t("users.inviteBatchModalHint")}</Text>
          <NumberInput label={t("users.inviteBatchCount")} min={1} max={200} value={batchCount} onChange={(v) => setBatchCount(Number(v) || 1)} />
          <NumberInput label={t("users.inviteBatchLength")} min={6} max={32} value={batchLength} onChange={(v) => setBatchLength(Number(v) || 10)} />
          <TextInput label={t("users.inviteBatchPrefix")} value={batchPrefix} onChange={(e) => setBatchPrefix(e.currentTarget.value)} />
          <TextInput
            label={t("users.inviteNote")}
            value={batchOptions.note}
            onChange={(event) => setBatchOptions((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <NumberInput
            label={t("users.inviteMaxUses")}
            min={0}
            max={999999}
            value={batchOptions.maxUses}
            onChange={(value) => setBatchOptions((current) => ({ ...current, maxUses: Number(value) || 0 }))}
          />
          <TextInput
            label={t("users.inviteExpiresAt")}
            placeholder="2026-04-04T12:00"
            value={batchOptions.expiresAt}
            onChange={(event) => setBatchOptions((current) => ({ ...current, expiresAt: event.currentTarget.value }))}
          />
          <Switch
            label={t("users.inviteEnabled")}
            checked={batchOptions.enabled}
            onChange={(event) => setBatchOptions((current) => ({ ...current, enabled: event.currentTarget.checked }))}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setInviteBatchModalOpened(false)} disabled={inviteBatchSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void batchCreate()} loading={inviteBatchSubmitting}>
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
        onClose={() => {
          if (inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id]) return;
          setInviteDeleteTarget(null);
        }}
        title={t("users.inviteDeleteConfirmTitle")}
        centered
      >
        <Stack gap="sm">
          <Text size="sm">{t("users.inviteDeleteConfirmHint")}</Text>
          <Text size="sm" ff="monospace">
            {inviteDeleteTarget?.code || "-"}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setInviteDeleteTarget(null)} disabled={Boolean(inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id])}>
              {t("common.cancel")}
            </Button>
            <Button
              color="red"
              loading={Boolean(inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id])}
              onClick={() => {
                if (!inviteDeleteTarget) return;
                const id = inviteDeleteTarget.id;
                void deleteInvite(id).then(() => setInviteDeleteTarget(null));
              }}
            >
              {t("users.inviteDelete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function InviteFormFields({
  t,
  form,
  onChange,
  codeEditable,
  onAutoGenerate
}: {
  t: (key: string) => string;
  form: InviteFormState;
  onChange: (value: InviteFormState | ((current: InviteFormState) => InviteFormState)) => void;
  codeEditable: boolean;
  onAutoGenerate: () => void;
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
        {codeEditable ? <Button size="xs" variant="default" onClick={onAutoGenerate}>{t("users.inviteAutoGenerate")}</Button> : null}
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

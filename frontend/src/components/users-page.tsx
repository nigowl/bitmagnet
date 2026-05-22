"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { KeyRound, LogIn, RefreshCw, UserPlus } from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import { apiRequest } from "@/lib/api";
import {
  DEFAULT_INVITE_FORM,
  USERNAME_PATTERN,
  type AdminUserItem,
  type InviteBatchOptions,
  type InviteBatchResponse,
  type InviteFormState,
  type InviteItem,
  type InvitesResponse,
  type UserFormState,
  type UserResponse,
  type UsersResponse,
  toISODateTime
} from "./users-page.helpers";
import { InviteManagerModals } from "./users-page.invites-modal";
import { UsersTable } from "./users-page.table";
import { UserEditorModal } from "./users-page.user-modal";

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
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
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

      <UsersTable t={t} users={users} loading={usersLoading} onEditUser={openEditUserEditor} />

      <UserEditorModal
        t={t}
        opened={userEditorOpened}
        mode={userEditorMode}
        saving={userSaving}
        form={userForm}
        onClose={closeUserEditor}
        onSubmit={() => void submitUserEditor()}
        onChange={setUserForm}
      />

      <InviteManagerModals
        t={t}
        modalOpened={inviteModalOpened}
        invites={invites}
        invitesLoading={invitesLoading}
        inviteDeleting={inviteDeleting}
        inviteEditorOpened={inviteEditorOpened}
        inviteEditorMode={inviteEditorMode}
        inviteSaving={inviteSaving}
        inviteForm={inviteForm}
        inviteBatchModalOpened={inviteBatchModalOpened}
        inviteBatchSubmitting={inviteBatchSubmitting}
        batchCount={batchCount}
        batchLength={batchLength}
        batchPrefix={batchPrefix}
        batchOptions={batchOptions}
        batchCreatedItems={batchCreatedItems}
        inviteDeleteTarget={inviteDeleteTarget}
        onCloseModal={closeInviteModal}
        onLoadInvites={() => void loadInvites()}
        onOpenCreateInviteEditor={openCreateInviteEditor}
        onOpenEditInviteEditor={openEditInviteEditor}
        onOpenInviteBatchModal={openInviteBatchModal}
        onSetInviteDeleteTarget={(item) => {
          if (inviteDeleteTarget && inviteDeleting[inviteDeleteTarget.id]) return;
          setInviteDeleteTarget(item);
        }}
        onCloseInviteEditor={closeInviteEditor}
        onSubmitInvite={() => void submitInvite()}
        onChangeInviteForm={setInviteForm}
        onCloseInviteBatchModal={() => {
          if (inviteBatchSubmitting) return;
          setInviteBatchModalOpened(false);
        }}
        onBatchCreate={() => void batchCreate()}
        onChangeBatchCount={setBatchCount}
        onChangeBatchLength={setBatchLength}
        onChangeBatchPrefix={setBatchPrefix}
        onChangeBatchOptions={setBatchOptions}
        onConfirmInviteDelete={(item) => {
          void deleteInvite(item.id).then(() => setInviteDeleteTarget(null));
        }}
      />
    </Stack>
  );
}

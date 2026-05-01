"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button, Group, Modal, PasswordInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type RememberFor, useAuth } from "@/auth/provider";
import { getLocalizedErrorMessage } from "@/lib/errors";
import { useI18n } from "@/languages/provider";

type DialogMode = "login" | "register";

type AuthDialogContextValue = {
  openLogin: () => void;
  openRegister: () => void;
};

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { login, register, accessSettings } = useAuth();

  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<DialogMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberFor, setRememberFor] = useState<RememberFor>("1w");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const openLogin = useCallback(() => {
    setMode("login");
    setOpened(true);
  }, []);

  const openRegister = useCallback(() => {
    setMode("register");
    setOpened(true);
  }, []);

  const close = useCallback(() => {
    if (loading) return;
    setOpened(false);
    setUsername("");
    setPassword("");
    setRememberFor("1w");
    setConfirmPassword("");
    setInviteCode("");
  }, [loading]);

  const submit = useCallback(async () => {
    if (loading) return;
    if (mode === "register" && password !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }
    if (mode === "register" && !accessSettings.registrationEnabled) {
      notifications.show({ color: "yellow", message: t("auth.registrationDisabled") });
      return;
    }
    if (mode === "register" && accessSettings.inviteRequired && !inviteCode.trim()) {
      notifications.show({ color: "yellow", message: t("auth.inviteRequired") });
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password, rememberFor);
        notifications.show({ color: "green", message: t("auth.loginSuccess") });
      } else {
        await register(username, password, inviteCode.trim());
        notifications.show({ color: "green", message: t("auth.registerSuccess") });
      }
      close();
    } catch (error) {
      const message = getLocalizedErrorMessage(error, t);
      if (message) {
        notifications.show({ color: "red", message });
      }
    } finally {
      setLoading(false);
    }
  }, [accessSettings.inviteRequired, accessSettings.registrationEnabled, close, confirmPassword, inviteCode, loading, login, mode, password, register, rememberFor, t, username]);

  const value = useMemo<AuthDialogContextValue>(
    () => ({ openLogin, openRegister }),
    [openLogin, openRegister]
  );

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      <Modal opened={opened} onClose={close} title={mode === "login" ? t("auth.login") : t("auth.register")}>
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Text c="dimmed">{mode === "login" ? t("auth.signInHint") : t("auth.signUpHint")}</Text>
          <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
          <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          {mode === "login" ? (
            <Select
              label={t("auth.keepSignedIn")}
              value={rememberFor}
              onChange={(value) => setRememberFor((value as RememberFor) || "1w")}
              data={[
                { value: "1d", label: t("auth.rememberDay") },
                { value: "1w", label: t("auth.rememberWeek") },
                { value: "1m", label: t("auth.rememberMonth") }
              ]}
              allowDeselect={false}
            />
          ) : null}
          {mode === "register" ? (
            <PasswordInput label={t("auth.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
          ) : null}
          {mode === "register" && accessSettings.inviteRequired ? (
            <TextInput label={t("auth.inviteCode")} value={inviteCode} onChange={(event) => setInviteCode(event.currentTarget.value)} />
          ) : null}
          <Button type="submit" loading={loading}>
            {mode === "login" ? t("auth.login") : t("auth.register")}
          </Button>
          <Group gap={6} justify="center">
            {mode === "login" ? (
              <>
                <Text size="sm" c="dimmed">{t("auth.createAccountPrompt")}</Text>
                <Button variant="subtle" size="compact-sm" onClick={openRegister}>{t("auth.register")}</Button>
              </>
            ) : (
              <>
                <Text size="sm" c="dimmed">{t("auth.signInPrompt")}</Text>
                <Button variant="subtle" size="compact-sm" onClick={openLogin}>{t("auth.login")}</Button>
              </>
            )}
          </Group>
        </Stack>
      </Modal>
    </AuthDialogContext.Provider>
  );
}

export function useAuthDialog() {
  const context = useContext(AuthDialogContext);
  if (!context) {
    throw new Error("useAuthDialog must be used inside AuthDialogProvider");
  }
  return context;
}

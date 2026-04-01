"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button, Group, Modal, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";

type DialogMode = "login" | "register";

type AuthDialogContextValue = {
  openLogin: () => void;
  openRegister: () => void;
};

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { login, register } = useAuth();

  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<DialogMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setConfirmPassword("");
  }, [loading]);

  const submit = useCallback(async () => {
    if (mode === "register" && password !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password);
        notifications.show({ color: "green", message: t("auth.loginSuccess") });
      } else {
        await register(username, password);
        notifications.show({ color: "green", message: t("auth.registerSuccess") });
      }
      close();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [close, confirmPassword, login, mode, password, register, t, username]);

  const value = useMemo<AuthDialogContextValue>(
    () => ({ openLogin, openRegister }),
    [openLogin, openRegister]
  );

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      <Modal opened={opened} onClose={close} title={mode === "login" ? t("auth.login") : t("auth.register")}> 
        <Stack>
          <Text c="dimmed">{mode === "login" ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}</Text>
          <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
          <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          {mode === "register" ? (
            <PasswordInput label={t("auth.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
          ) : null}
          <Button loading={loading} onClick={() => void submit()}>
            {mode === "login" ? t("auth.login") : t("auth.register")}
          </Button>
          <Group gap={6} justify="center">
            {mode === "login" ? (
              <>
                <Text size="sm" c="dimmed">{t("auth.noAccount")}</Text>
                <Button variant="subtle" size="compact-sm" onClick={openRegister}>{t("auth.register")}</Button>
              </>
            ) : (
              <>
                <Text size="sm" c="dimmed">{t("auth.hasAccount")}</Text>
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

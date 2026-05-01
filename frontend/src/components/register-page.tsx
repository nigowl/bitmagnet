"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAuth } from "@/auth/provider";
import { getLocalizedErrorMessage } from "@/lib/errors";
import { useI18n } from "@/languages/provider";

export function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { register, accessSettings } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    if (!accessSettings.registrationEnabled) {
      notifications.show({ color: "yellow", message: t("auth.registrationDisabled") });
      return;
    }
    if (password !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }
    if (accessSettings.inviteRequired && !inviteCode.trim()) {
      notifications.show({ color: "yellow", message: t("auth.inviteRequired") });
      return;
    }

    setLoading(true);
    try {
      await register(username, password, inviteCode.trim());
      notifications.show({ color: "green", message: t("auth.registerSuccess") });
      router.push("/profile");
    } catch (error) {
      const message = getLocalizedErrorMessage(error, t);
      if (message) {
        notifications.show({ color: "red", message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      component="form"
      className="glass-card auth-page-card"
      withBorder
      maw={460}
      w="min(100%, 460px)"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Stack>
        <Title order={2}>{t("auth.register")}</Title>
        <Text size="sm" c="dimmed">{t("auth.signUpHint")}</Text>
        <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
        <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
        <PasswordInput label={t("auth.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
        {accessSettings.inviteRequired ? (
          <TextInput label={t("auth.inviteCode")} value={inviteCode} onChange={(event) => setInviteCode(event.currentTarget.value)} />
        ) : null}
        <Button type="submit" loading={loading}>
          {t("auth.register")}
        </Button>
        <Text size="sm" c="dimmed">
          {t("auth.signInPrompt")} <Anchor component={Link} href="/login">{t("auth.login")}</Anchor>
        </Text>
      </Stack>
    </Card>
  );
}

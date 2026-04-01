"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";

export function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (password !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }

    setLoading(true);
    try {
      await register(username, password);
      notifications.show({ color: "green", message: t("auth.registerSuccess") });
      router.push("/profile");
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card" withBorder maw={460} mx="auto">
      <Stack>
        <Title order={2}>{t("auth.register")}</Title>
        <Text c="dimmed">{t("auth.registerSubtitle")}</Text>
        <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
        <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
        <PasswordInput label={t("auth.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
        <Button loading={loading} onClick={() => void submit()}>
          {t("auth.register")}
        </Button>
        <Text size="sm" c="dimmed">
          {t("auth.hasAccount")} <Anchor component={Link} href="/login">{t("auth.login")}</Anchor>
        </Text>
      </Stack>
    </Card>
  );
}

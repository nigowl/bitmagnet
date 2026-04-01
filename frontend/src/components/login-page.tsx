"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";

export function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await login(username, password);
      notifications.show({ color: "green", message: t("auth.loginSuccess") });
      router.push("/");
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card" withBorder maw={460} mx="auto">
      <Stack>
        <Title order={2}>{t("auth.login")}</Title>
        <Text c="dimmed">{t("auth.loginSubtitle")}</Text>
        <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
        <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
        <Button loading={loading} onClick={() => void submit()}>
          {t("auth.login")}
        </Button>
        <Text size="sm" c="dimmed">
          {t("auth.noAccount")} <Anchor component={Link} href="/register">{t("auth.register")}</Anchor>
        </Text>
      </Stack>
    </Card>
  );
}

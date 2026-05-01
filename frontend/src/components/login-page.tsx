"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Anchor, Button, Card, PasswordInput, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type RememberFor, useAuth } from "@/auth/provider";
import { getLocalizedErrorMessage } from "@/lib/errors";
import { useI18n } from "@/languages/provider";

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberFor, setRememberFor] = useState<RememberFor>("1w");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await login(username, password, rememberFor);
      notifications.show({ color: "green", message: t("auth.loginSuccess") });
      const redirect = (searchParams.get("redirect") || "").trim();
      if (redirect.startsWith("/")) {
        router.push(redirect);
      } else {
        router.push("/");
      }
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
        <Title order={2}>{t("auth.login")}</Title>
        <Text size="sm" c="dimmed">{t("auth.signInHint")}</Text>
        <TextInput label={t("auth.username")} value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
        <PasswordInput label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
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
        <Button type="submit" loading={loading}>
          {t("auth.login")}
        </Button>
        <Text size="sm" c="dimmed">
          {t("auth.createAccountPrompt")} <Anchor component={Link} href="/register">{t("auth.register")}</Anchor>
        </Text>
      </Stack>
    </Card>
  );
}

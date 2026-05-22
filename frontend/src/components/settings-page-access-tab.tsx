"use client";

import { Accordion, Card, Stack, Switch, Tabs, Text, Title } from "@mantine/core";
import type { SystemSettings } from "./settings-page.types";
import type { SettingsPageStateSetter, TFunction } from "./settings-page-tabs";

type SettingsAccessTabProps = {
  t: TFunction;
  settings: SystemSettings;
  setSettings: SettingsPageStateSetter<SystemSettings>;
};

export function SettingsAccessTab({ t, settings, setSettings }: SettingsAccessTabProps) {
  return (
    <Tabs.Panel value="access" pt="md">
      <Stack gap="md">
        <Title order={4}>{t("settings.accessTitle")}</Title>
        <Text c="dimmed" size="sm">{t("settings.accessHint")}</Text>
        <Accordion
          className="settings-sections-accordion"
          variant="separated"
          radius="lg"
          multiple
          defaultValue={["access-membership"]}
        >
          <Accordion.Item value="access-membership">
            <Accordion.Control>{t("settings.accessMembershipTitle")}</Accordion.Control>
            <Accordion.Panel>
              <Card className="settings-section-block" radius="lg">
                <Stack gap="sm">
                  <Switch
                    label={t("settings.authMembershipEnabled")}
                    checked={settings.auth.membershipEnabled}
                    onChange={(event) => setSettings((current) => ({
                      ...current,
                      auth: { ...current.auth, membershipEnabled: event.currentTarget.checked }
                    }))}
                  />
                  <Switch
                    label={t("settings.authRegistrationEnabled")}
                    checked={settings.auth.registrationEnabled}
                    onChange={(event) => setSettings((current) => ({
                      ...current,
                      auth: { ...current.auth, registrationEnabled: event.currentTarget.checked }
                    }))}
                  />
                  {settings.auth.registrationEnabled ? (
                    <div className="settings-toggle-panel">
                      <Switch
                        label={t("settings.authInviteRequired")}
                        checked={settings.auth.inviteRequired}
                        onChange={(event) => setSettings((current) => ({
                          ...current,
                          auth: { ...current.auth, inviteRequired: event.currentTarget.checked }
                        }))}
                      />
                    </div>
                  ) : null}
                </Stack>
              </Card>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Tabs.Panel>
  );
}

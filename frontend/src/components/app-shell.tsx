"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  AppShell,
  Burger,
  Button,
  Container,
  Drawer,
  Group,
  SegmentedControl,
  Stack,
  Text
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Clapperboard, Gauge, HeartPulse, ListOrdered, Radar } from "lucide-react";
import { useI18n } from "@/languages/provider";

const centerItems = [
  { href: "/", labelKey: "nav.home", icon: Gauge },
  { href: "/torrents", labelKey: "nav.torrents", icon: ListOrdered },
  { href: "/media", labelKey: "nav.media", icon: Clapperboard }
] as const;

const rightItems = [
  { href: "/monitor", labelKey: "nav.monitor", icon: HeartPulse },
  { href: "/queue", labelKey: "nav.queue", icon: Radar }
] as const;

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroup({ pathname, items, t }: { pathname: string; items: ReadonlyArray<{ href: string; labelKey: string; icon: ComponentType<{ size?: number }> }>; t: (key: string) => string }) {
  return (
    <Group gap={8} wrap="nowrap">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isRouteActive(pathname, item.href);
        return (
          <Button
            key={item.href}
            renderRoot={(props) => <Link href={item.href} {...props} />}
            variant={active ? "light" : "subtle"}
            color={active ? "cyan" : "gray"}
            leftSection={<Icon size={15} />}
            radius="xl"
            className={active ? "nav-pill nav-pill-active" : "nav-pill"}
          >
            {t(item.labelKey)}
          </Button>
        );
      })}
    </Group>
  );
}

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [opened, { toggle, close }] = useDisclosure(false);
  const { t, locale, setLocale } = useI18n();

  return (
    <AppShell padding={{ base: "sm", md: "md" }} header={{ height: 78 }}>
      <AppShell.Header className="top-nav-shell">
        <Container size="xl" h="100%" px={{ base: "sm", md: "md" }}>
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="lg" size="sm" />
              <Link href="/" className="brand-link">
                <span className="brand-dot" />
                <Text fw={800} size="lg" c="var(--mantine-color-gray-0)">
                  bitmagnet
                </Text>
              </Link>
            </Group>

            <Group visibleFrom="lg" justify="center" style={{ flex: 1 }}>
              <NavGroup pathname={pathname} items={centerItems} t={t} />
            </Group>

            <Group gap="xs" wrap="nowrap">
              <Group visibleFrom="md">
                <NavGroup pathname={pathname} items={rightItems} t={t} />
              </Group>
              <SegmentedControl
                size="xs"
                radius="xl"
                value={locale}
                onChange={(value) => setLocale(value as "en" | "zh")}
                data={[
                  { label: "EN", value: "en" },
                  { label: "中文", value: "zh" }
                ]}
              />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} title="bitmagnet" padding="md" size="xs" hiddenFrom="lg">
        <Stack>
          <Text c="dimmed" size="sm">
            {t("nav.main")}
          </Text>
          {centerItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(pathname, item.href);
            return (
              <Button
                key={item.href}
                renderRoot={(props) => <Link href={item.href} {...props} />}
                justify="flex-start"
                variant={active ? "light" : "subtle"}
                leftSection={<Icon size={15} />}
                onClick={close}
              >
                {t(item.labelKey)}
              </Button>
            );
          })}
          <Text c="dimmed" size="sm" mt="sm">
            {t("nav.ops")}
          </Text>
          {rightItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(pathname, item.href);
            return (
              <Button
                key={item.href}
                renderRoot={(props) => <Link href={item.href} {...props} />}
                justify="flex-start"
                variant={active ? "light" : "subtle"}
                leftSection={<Icon size={15} />}
                onClick={close}
              >
                {t(item.labelKey)}
              </Button>
            );
          })}
        </Stack>
      </Drawer>

      <AppShell.Main>
        <Container size="xl" className="page-shell" px={{ base: "xs", md: "md" }}>
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

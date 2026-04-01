"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Drawer,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme
} from "@mantine/core";
import { useDisclosure, useMounted } from "@mantine/hooks";
import {
  CircleUserRound,
  Clapperboard,
  Gauge,
  HeartPulse,
  ListOrdered,
  LogIn,
  LogOut,
  MoonStar,
  Radar,
  SunMedium,
  Tv,
  UserPlus
} from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number }) => ReactNode;
  category?: "movie" | "series" | "anime";
};

const adminItems = [
  { href: "/monitor", labelKey: "nav.monitor", icon: HeartPulse },
  { href: "/queue", labelKey: "nav.queue", icon: Radar }
] as const;

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, category: string | null, item: NavItem): boolean {
  if (item.category) {
    return pathname === "/media" && category === item.category;
  }

  return isRouteActive(pathname, item.href);
}

function buildMediaHref(category?: string): string {
  if (!category) return "/media";
  return `/media?category=${encodeURIComponent(category)}`;
}

function HeaderLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;

  return (
    <Link href={item.href} className={active ? "nav-link nav-link-active" : "nav-link"} onClick={onClick}>
      <span className="nav-link-icon"><Icon size={16} /></span>
      <span>{item.label}</span>
    </Link>
  );
}

export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [opened, { toggle, close }] = useDisclosure(false);
  const { t, locale, setLocale } = useI18n();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const themeReady = useMounted();
  const { user, isAdmin, logout } = useAuth();
  const { openLogin, openRegister } = useAuthDialog();

  const currentCategory = searchParams.get("category");
  const leftItems: NavItem[] = [
    { href: "/", label: t("nav.home"), icon: Gauge },
    { href: buildMediaHref("movie"), label: t("contentTypes.movie"), icon: Clapperboard, category: "movie" },
    { href: buildMediaHref("series"), label: t("contentTypes.tv_show"), icon: Tv, category: "series" },
    { href: buildMediaHref("anime"), label: t("nav.anime"), icon: Clapperboard, category: "anime" },
    { href: "/torrents", label: t("nav.torrents"), icon: ListOrdered }
  ];

  const toggleTheme = () => {
    setColorScheme(computedColorScheme === "dark" ? "light" : "dark");
  };
  const resolvedColorScheme = themeReady ? computedColorScheme : "light";
  const renderThemeIcon = (variant: "sm" | "md") => (
    <span
      className={variant === "sm" ? "nav-theme-icon-stack nav-theme-icon-stack-sm" : "nav-theme-icon-stack nav-theme-icon-stack-md"}
      data-ready={themeReady ? "true" : "false"}
      data-theme={resolvedColorScheme}
      aria-hidden="true"
    >
      <SunMedium size={variant === "sm" ? 15 : 17} className="nav-theme-icon nav-theme-icon-sun" />
      <MoonStar size={variant === "sm" ? 15 : 17} className="nav-theme-icon nav-theme-icon-moon" />
    </span>
  );

  return (
    <AppShell padding={0} header={{ height: 76 }}>
      <AppShell.Header className="top-nav-shell">
        <div className="top-nav-inner">
          <div className="top-nav-row">
            <Group gap="md" wrap="nowrap" className="top-nav-left">
              <Burger opened={opened} onClick={toggle} hiddenFrom="lg" size="sm" />
              <Link href="/" className="brand-link">
                <span className="brand-dot" />
                <Text fw={800} size="lg" c="inherit">
                  bitmagnet
                </Text>
              </Link>
              <Group gap={8} wrap="nowrap" visibleFrom="lg" className="top-nav-links">
                {leftItems.map((item) => (
                  <HeaderLink
                    key={item.href}
                    item={item}
                    active={isNavItemActive(pathname, currentCategory, item)}
                  />
                ))}
              </Group>
            </Group>

            <Group gap="xs" wrap="nowrap" className="top-nav-right">
              <SegmentedControl
                className="nav-locale-switch"
                size="xs"
                radius="xl"
                value={locale}
                onChange={(value) => setLocale(value as "en" | "zh")}
                data={[
                  { label: "EN", value: "en" },
                  { label: "中文", value: "zh" }
                ]}
              />

              <ActionIcon
                className="nav-utility-button"
                variant="default"
                radius="xl"
                size={38}
                onClick={toggleTheme}
                aria-label={resolvedColorScheme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}
              >
                {renderThemeIcon("md")}
              </ActionIcon>

              <Menu shadow="md" width={220} position="bottom-end">
                <Menu.Target>
                  {user ? (
                    <Button variant="default" radius="xl" className="nav-account-button nav-utility-button" leftSection={<Avatar size={18} radius="xl">{user.username.slice(0, 1).toUpperCase()}</Avatar>}>
                      {user.username}
                    </Button>
                  ) : (
                    <Button variant="default" radius="xl" className="nav-account-button nav-utility-button" leftSection={<CircleUserRound size={15} />}>
                      {t("nav.account")}
                    </Button>
                  )}
                </Menu.Target>

                <Menu.Dropdown>
                  {user ? (
                    <>
                      <Menu.Label>{t("nav.account")}</Menu.Label>
                      <Menu.Item leftSection={<CircleUserRound size={14} />} component={Link} href="/profile">
                        {t("nav.userCenter")}
                      </Menu.Item>
                      {isAdmin ? <Menu.Divider /> : null}
                      {isAdmin
                        ? adminItems.map((item) => {
                            const Icon = item.icon;
                            return (
                              <Menu.Item key={item.href} leftSection={<Icon size={14} />} component={Link} href={item.href}>
                                {t(item.labelKey)}
                              </Menu.Item>
                            );
                          })
                        : null}
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<LogOut size={14} />}
                        onClick={() => {
                          void logout().then(() => router.push("/"));
                        }}
                      >
                        {t("nav.logout")}
                      </Menu.Item>
                    </>
                  ) : (
                    <>
                      <Menu.Item leftSection={<LogIn size={14} />} onClick={openLogin}>
                        {t("nav.login")}
                      </Menu.Item>
                      <Menu.Item leftSection={<UserPlus size={14} />} onClick={openRegister}>
                        {t("nav.register")}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>
        </div>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} title="bitmagnet" padding="md" size="xs" hiddenFrom="lg">
        <Stack gap="md">
          <Group grow>
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
            <Button
              variant="default"
              radius="xl"
              leftSection={renderThemeIcon("sm")}
              onClick={toggleTheme}
            >
              {resolvedColorScheme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}
            </Button>
          </Group>

          <Text c="dimmed" size="sm">
            {t("nav.main")}
          </Text>
          {leftItems.map((item) => (
            <HeaderLink
              key={item.href}
              item={item}
              active={isNavItemActive(pathname, currentCategory, item)}
              onClick={close}
            />
          ))}

          <Text c="dimmed" size="sm" mt="sm">
            {t("nav.account")}
          </Text>
          {user ? (
            <>
              <Button
                renderRoot={(props) => <Link href="/profile" {...props} />}
                justify="flex-start"
                variant={isRouteActive(pathname, "/profile") ? "light" : "subtle"}
                leftSection={<CircleUserRound size={15} />}
                onClick={close}
              >
                {t("nav.userCenter")}
              </Button>
              {isAdmin
                ? adminItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.href}
                        renderRoot={(props) => <Link href={item.href} {...props} />}
                        justify="flex-start"
                        variant={isRouteActive(pathname, item.href) ? "light" : "subtle"}
                        leftSection={<Icon size={15} />}
                        onClick={close}
                      >
                        {t(item.labelKey)}
                      </Button>
                    );
                  })
                : null}
              <Button
                justify="flex-start"
                variant="subtle"
                color="red"
                leftSection={<LogOut size={15} />}
                onClick={() => {
                  close();
                  void logout().then(() => router.push("/"));
                }}
              >
                {t("nav.logout")}
              </Button>
            </>
          ) : (
            <>
              <Button
                justify="flex-start"
                variant="subtle"
                leftSection={<LogIn size={15} />}
                onClick={() => {
                  close();
                  openLogin();
                }}
              >
                {t("nav.login")}
              </Button>
              <Button
                justify="flex-start"
                variant="subtle"
                leftSection={<UserPlus size={15} />}
                onClick={() => {
                  close();
                  openRegister();
                }}
              >
                {t("nav.register")}
              </Button>
            </>
          )}
        </Stack>
      </Drawer>

      <AppShell.Main className="app-shell-main">
        <div className="page-shell page-shell-fluid">
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

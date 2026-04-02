"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Drawer,
  Group,
  Modal,
  Menu,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme
} from "@mantine/core";
import { useDisclosure, useMounted } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  CircleUserRound,
  Clapperboard,
  Gauge,
  Heart,
  HeartPulse,
  KeyRound,
  ListOrdered,
  LogIn,
  LogOut,
  MoonStar,
  Radar,
  ScrollText,
  Settings,
  SunMedium,
  Tv,
  UserPlus,
  Wrench
} from "lucide-react";
import { useAuthDialog } from "@/auth/dialog";
import { useAuth } from "@/auth/provider";
import { useI18n } from "@/languages/provider";
import { SiteFooter } from "@/components/site-footer";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number }) => ReactNode;
};

const adminItems = [
  { href: "/monitor", labelKey: "nav.monitor", icon: HeartPulse },
  { href: "/logs", labelKey: "nav.logs", icon: ScrollText },
  { href: "/queue", labelKey: "nav.queue", icon: Radar },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/maintenance", labelKey: "nav.maintenance", icon: Wrench }
] as const;

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, item: NavItem): boolean {
  return isRouteActive(pathname, item.href);
}

function buildMediaHref(category?: string): string {
  if (!category) return "/media/movie";
  return `/media/${encodeURIComponent(category)}`;
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
  const [opened, { toggle, close }] = useDisclosure(false);
  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);
  const { t, locale, setLocale } = useI18n();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const themeReady = useMounted();
  const { user, isAdmin, logout, changePassword } = useAuth();
  const { openLogin, openRegister } = useAuthDialog();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const leftItems: NavItem[] = [
    { href: "/", label: t("nav.home"), icon: Gauge },
    { href: buildMediaHref("movie"), label: t("contentTypes.movie"), icon: Clapperboard },
    { href: buildMediaHref("series"), label: t("contentTypes.tv_show"), icon: Tv },
    { href: buildMediaHref("anime"), label: t("nav.anime"), icon: Clapperboard },
    { href: "/torrents", label: t("nav.torrents"), icon: ListOrdered }
  ];

  const toggleTheme = () => {
    setColorScheme(computedColorScheme === "dark" ? "light" : "dark");
  };

  const submitPasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      notifications.show({ color: "yellow", message: t("auth.passwordMismatch") });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      notifications.show({ color: "green", message: t("profile.passwordChanged") });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      closePasswordModal();
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingPassword(false);
    }
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
                    active={isNavItemActive(pathname, item)}
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
                      <Menu.Item leftSection={<Heart size={14} />} component={Link} href="/favorites">
                        {t("nav.myFavorites")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<KeyRound size={14} />}
                        onClick={openPasswordModal}
                      >
                        {t("nav.changePassword")}
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
              active={isNavItemActive(pathname, item)}
              onClick={close}
            />
          ))}

          <Text c="dimmed" size="sm" mt="sm">
            {t("nav.account")}
          </Text>
          {user ? (
            <>
              <Button
                renderRoot={(props) => <Link href="/favorites" {...props} />}
                justify="flex-start"
                variant={isRouteActive(pathname, "/favorites") ? "light" : "subtle"}
                leftSection={<Heart size={15} />}
                onClick={close}
              >
                {t("nav.myFavorites")}
              </Button>
              <Button
                justify="flex-start"
                variant="subtle"
                leftSection={<KeyRound size={15} />}
                onClick={() => {
                  close();
                  openPasswordModal();
                }}
              >
                {t("nav.changePassword")}
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
        <SiteFooter />
      </AppShell.Main>

      <Modal opened={passwordModalOpened} onClose={closePasswordModal} title={t("profile.changePassword")} centered>
        <Stack>
          <PasswordInput
            label={t("profile.oldPassword")}
            value={oldPassword}
            onChange={(event) => setOldPassword(event.currentTarget.value)}
          />
          <PasswordInput
            label={t("profile.newPassword")}
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
          />
          <PasswordInput
            label={t("profile.confirmPassword")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closePasswordModal}>{t("common.cancel")}</Button>
            <Button loading={savingPassword} onClick={() => void submitPasswordChange()}>{t("profile.savePassword")}</Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}

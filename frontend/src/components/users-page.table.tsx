"use client";

import { ActionIcon, Badge, Card, Group, Loader, ScrollArea, Table, Text } from "@mantine/core";
import { Pencil } from "lucide-react";
import type { AdminUserItem } from "./users-page.helpers";
import { formatDate } from "./users-page.helpers";

type UsersTableProps = {
  t: (key: string) => string;
  users: AdminUserItem[];
  loading: boolean;
  onEditUser: (item: AdminUserItem) => void;
};

export function UsersTable({ t, users, loading, onEditUser }: UsersTableProps) {
  return (
    <Card className="glass-card" withBorder>
      {loading ? (
        <Group justify="center" py="xl"><Loader size="sm" /></Group>
      ) : users.length === 0 ? (
        <Text c="dimmed">{t("users.emptyUsers")}</Text>
      ) : (
        <ScrollArea type="auto" scrollbarSize={8}>
          <Table striped withTableBorder highlightOnHover miw={980}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>{t("users.userUsername")}</Table.Th>
                <Table.Th>{t("users.userRole")}</Table.Th>
                <Table.Th>{t("users.userCreatedAt")}</Table.Th>
                <Table.Th>{t("users.userInviteCode")}</Table.Th>
                <Table.Th>{t("users.userInviteUsedAt")}</Table.Th>
                <Table.Th>{t("users.userInviteNote")}</Table.Th>
                <Table.Th>{t("users.userActions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{item.id}</Table.Td>
                  <Table.Td>{item.username}</Table.Td>
                  <Table.Td><Badge variant="light">{item.role}</Badge></Table.Td>
                  <Table.Td>{formatDate(item.createdAt)}</Table.Td>
                  <Table.Td>{item.inviteCode?.trim() || "-"}</Table.Td>
                  <Table.Td>{formatDate(item.inviteCodeUsedAt)}</Table.Td>
                  <Table.Td>{item.inviteNote?.trim() || "-"}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <ActionIcon className="app-icon-btn" variant="default" size="sm" onClick={() => onEditUser(item)}>
                        <Pencil size={13} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Card>
  );
}

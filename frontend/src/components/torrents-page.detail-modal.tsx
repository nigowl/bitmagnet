"use client";

import { Badge, Button, Group, Loader, Modal, Stack, Table, Text, TextInput } from "@mantine/core";
import { Copy, ExternalLink, Tags, Trash2, WandSparkles } from "lucide-react";
import type { TorrentFilesResponse, TorrentRow } from "./torrents-page.helpers";
import { formatBytes } from "./torrents-page.helpers";

type TorrentDetailFile = TorrentFilesResponse["torrent"]["files"]["items"][number];

type TorrentDetailModalProps = {
  t: (key: string) => string;
  opened: boolean;
  activeItem: TorrentRow | null;
  detailTagInput: string;
  detailFiles: TorrentDetailFile[];
  loadingFiles: boolean;
  renderContentType: (type?: string | null) => string;
  onClose: () => void;
  onChangeTags: (value: string) => void;
  onMutateTags: (mode: "set" | "put" | "delete") => void;
  onCopyHash: (hash: string) => void;
  onOpenMagnet: (magnetUri?: string | null) => void;
  onReprocess: () => void;
  onDelete: () => void;
};

export function TorrentDetailModal({
  t,
  opened,
  activeItem,
  detailTagInput,
  detailFiles,
  loadingFiles,
  renderContentType,
  onClose,
  onChangeTags,
  onMutateTags,
  onCopyHash,
  onOpenMagnet,
  onReprocess,
  onDelete
}: TorrentDetailModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={activeItem?.title || activeItem?.torrent.name} size="xl">
      {!activeItem ? null : (
        <Stack gap="md">
          <Text c="dimmed">{activeItem.content?.overview || "-"}</Text>
          <Group gap={6}>
            {renderContentType(activeItem.contentType) ? (
              <Badge variant="light">{renderContentType(activeItem.contentType)}</Badge>
            ) : null}
            <Badge variant="light">{t("torrents.table.seeders")}: {activeItem.seeders ?? "-"}</Badge>
            <Badge variant="light">{t("torrents.table.leechers")}: {activeItem.leechers ?? "-"}</Badge>
            <Badge variant="light">{formatBytes(activeItem.torrent.size)}</Badge>
          </Group>
          <Text ff="monospace" size="sm">{activeItem.infoHash}</Text>

          <TextInput
            label={t("torrents.tagsInput")}
            value={detailTagInput}
            onChange={(event) => onChangeTags(event.currentTarget.value)}
            rightSection={<Tags size={16} />}
          />
          <Group>
            <Button size="xs" onClick={() => onMutateTags("set")}>{t("torrents.setTags")}</Button>
            <Button size="xs" variant="light" onClick={() => onMutateTags("put")}>{t("torrents.putTags")}</Button>
            <Button size="xs" variant="light" color="orange" onClick={() => onMutateTags("delete")}>{t("torrents.deleteTags")}</Button>
          </Group>

          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>{t("torrents.table.path")}</Table.Th>
                <Table.Th>{t("torrents.table.type")}</Table.Th>
                <Table.Th>{t("torrents.table.size")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loadingFiles ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : detailFiles.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" py="md">
                      {t("torrents.noFiles")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                detailFiles.map((file) => (
                  <Table.Tr key={`${file.index}:${file.path}`}>
                    <Table.Td>{file.index}</Table.Td>
                    <Table.Td>{file.path}</Table.Td>
                    <Table.Td>{file.fileType || "-"}</Table.Td>
                    <Table.Td>{formatBytes(file.size)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>

          <Group justify="space-between" className="modal-footer">
            <Group>
              <Button size="xs" leftSection={<Copy size={14} />} variant="light" onClick={() => onCopyHash(activeItem.infoHash)}>
                {t("torrents.copyHash")}
              </Button>
              <Button size="xs" leftSection={<ExternalLink size={14} />} variant="light" onClick={() => onOpenMagnet(activeItem.torrent.magnetUri)}>
                {t("torrents.openMagnet")}
              </Button>
              <Button size="xs" leftSection={<WandSparkles size={14} />} variant="light" onClick={onReprocess}>
                {t("torrents.reprocess")}
              </Button>
              <Button size="xs" leftSection={<Trash2 size={14} />} color="red" variant="light" onClick={onDelete}>
                {t("torrents.delete")}
              </Button>
            </Group>
            <Button size="xs" variant="default" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

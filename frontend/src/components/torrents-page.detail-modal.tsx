"use client";

import Link from "next/link";
import { Badge, Button, Group, Loader, Modal, Stack, Table, Text } from "@mantine/core";
import { Copy, ExternalLink, Eye } from "lucide-react";
import type { TorrentFilesResponse, TorrentRow } from "./torrents-page.helpers";
import { formatBytes } from "./torrents-page.helpers";

type TorrentDetailFile = TorrentFilesResponse["torrent"]["files"]["items"][number];

type TorrentDetailModalProps = {
  t: (key: string) => string;
  opened: boolean;
  activeItem: TorrentRow | null;
  detailFiles: TorrentDetailFile[];
  loadingFiles: boolean;
  renderContentType: (type?: string | null) => string;
  detailHref: string;
  onClose: () => void;
  onCopyHash: (hash: string) => void;
  onOpenMagnet: (magnetUri?: string | null) => void;
};

export function TorrentDetailModal({
  t,
  opened,
  activeItem,
  detailFiles,
  loadingFiles,
  renderContentType,
  detailHref,
  onClose,
  onCopyHash,
  onOpenMagnet
}: TorrentDetailModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={activeItem?.title || activeItem?.torrent.name}
      size="xl"
      classNames={{
        content: "torrent-detail-modal-content",
        body: "torrent-detail-modal-body"
      }}
    >
      {!activeItem ? null : (
        <div className="torrent-detail-modal-shell">
          <Stack gap="md" className="torrent-detail-modal-scroll">
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

            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>{t("torrents.table.path")}</Table.Th>
                  <Table.Th>{t("torrents.table.type")}</Table.Th>
                  <Table.Th className="torrent-file-size-column">{t("torrents.table.size")}</Table.Th>
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
                      <Table.Td className="torrent-file-size-column">{formatBytes(file.size)}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Stack>

          <Group justify="space-between" className="modal-footer torrent-detail-modal-footer">
            <Group>
              <Button size="xs" leftSection={<Copy size={14} />} variant="light" onClick={() => onCopyHash(activeItem.infoHash)}>
                {t("torrents.copyHash")}
              </Button>
              <Button size="xs" leftSection={<ExternalLink size={14} />} variant="light" onClick={() => onOpenMagnet(activeItem.torrent.magnetUri)}>
                {t("torrents.openMagnet")}
              </Button>
              <Button
                size="xs"
                leftSection={<Eye size={14} />}
                variant="light"
                renderRoot={(props) => <Link href={detailHref} {...props} />}
              >
                {t("torrents.details")}
              </Button>
            </Group>
            <Button size="xs" variant="default" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </Group>
        </div>
      )}
    </Modal>
  );
}

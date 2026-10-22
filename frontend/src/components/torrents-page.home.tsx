"use client";

import { Group, Pagination, Text } from "@mantine/core";
import { TorrentSearchHistory } from "./torrents-page.filters";
import { TorrentResultsCard } from "./torrents-page.results";
import { torrentOrderFields } from "@/lib/domain";
import type { TorrentRow } from "./torrents-page.helpers";

type TorrentHomePanelsProps = {
  t: (key: string) => string;
  searchHistory: string[];
  historyPage: number;
  onHistoryPageChange: (page: number) => void;
  onSelectHistory: (value: string) => void;
  onRemoveHistory: (value: string) => void;
  onClearHistory: () => void;
  loadingLatest: boolean;
  latestItems: TorrentRow[];
  latestPage: number;
  latestPageItems: TorrentRow[];
  latestTotalPages: number;
  onLatestPageChange: (page: number) => void;
  orderLabels: Record<(typeof torrentOrderFields)[number], string>;
  currentListHref: string;
  renderContentType: (type?: string | null) => string;
  onCopyHash: (hash: string) => void;
  onOpenMagnet: (magnetUri?: string | null) => void;
  onOpenDetail: (item: TorrentRow) => void;
};

export function TorrentHomePanels({
  t,
  searchHistory,
  historyPage,
  onHistoryPageChange,
  onSelectHistory,
  onRemoveHistory,
  onClearHistory,
  loadingLatest,
  latestItems,
  latestPage,
  latestPageItems,
  latestTotalPages,
  onLatestPageChange,
  orderLabels,
  currentListHref,
  renderContentType,
  onCopyHash,
  onOpenMagnet,
  onOpenDetail
}: TorrentHomePanelsProps) {
  return (
    <>
      <TorrentSearchHistory
        t={t}
        items={searchHistory}
        page={historyPage}
        onPageChange={onHistoryPageChange}
        onSelect={onSelectHistory}
        onRemove={onRemoveHistory}
        onClear={onClearHistory}
      />
      <TorrentResultsCard
        t={t}
        loading={loadingLatest}
        items={latestPageItems}
        heading={t("torrents.latestTorrents")}
        emptyMessage={t("torrents.latestEmpty")}
        showSortControls={false}
        orderBy={null}
        descending
        orderLabels={orderLabels}
        queryString=""
        currentListHref={currentListHref}
        renderContentType={renderContentType}
        onChangeOrder={() => undefined}
        onChangeDescending={() => undefined}
        onCopyHash={onCopyHash}
        onOpenMagnet={onOpenMagnet}
        onOpenDetail={onOpenDetail}
      />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{t("common.total")}: {latestItems.length}</Text>
        <Pagination total={latestTotalPages} value={latestPage} onChange={onLatestPageChange} />
      </Group>
    </>
  );
}

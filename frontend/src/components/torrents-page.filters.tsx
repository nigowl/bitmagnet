"use client";

import { ActionIcon, Card, Group, Pagination, Text, TextInput, Tooltip } from "@mantine/core";
import { Search, Trash2, X } from "lucide-react";

type TorrentSearchBarProps = {
  t: (key: string) => string;
  search: string;
  onSearchChange: (value: string) => void;
  onCommitSearch: () => void;
};

export function TorrentSearchBar({
  t,
  search,
  onSearchChange,
  onCommitSearch
}: TorrentSearchBarProps) {
  return (
    <Card className="glass-card torrent-search-bar" withBorder>
      <Group align="flex-end" wrap="wrap">
        <TextInput
          flex={1}
          miw={0}
          leftSection={<Search size={16} />}
          placeholder={t("torrents.search")}
          value={search}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          onBlur={onCommitSearch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitSearch();
              event.currentTarget.blur();
            }
          }}
        />
      </Group>
    </Card>
  );
}

type TorrentSearchHistoryProps = {
  t: (key: string) => string;
  items: string[];
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (value: string) => void;
  onRemove: (value: string) => void;
  onClear: () => void;
};

const SEARCH_HISTORY_PAGE_SIZE = 10;

export function TorrentSearchHistory({
  t,
  items,
  page,
  onPageChange,
  onSelect,
  onRemove,
  onClear
}: TorrentSearchHistoryProps) {
  if (items.length === 0) return null;

  const start = (page - 1) * SEARCH_HISTORY_PAGE_SIZE;
  const visibleItems = items.slice(start, start + SEARCH_HISTORY_PAGE_SIZE);

  return (
    <Card className="glass-card torrent-history-card" withBorder>
      <Group justify="space-between" mb="sm">
        <Text fw={700}>{t("torrents.searchHistory")}</Text>
        <Tooltip label={t("torrents.clearSearchHistory")}>
          <ActionIcon className="app-icon-btn" variant="light" color="red" onClick={onClear} aria-label={t("torrents.clearSearchHistory")}>
            <Trash2 size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div className="torrent-history-list">
        {visibleItems.map((item) => (
          <div key={item} className="torrent-history-item">
            <button type="button" className="torrent-history-value" onClick={() => onSelect(item)}>
              {item}
            </button>
            <Tooltip label={t("common.delete")}>
              <ActionIcon
                className="torrent-history-remove"
                variant="subtle"
                size="sm"
                onClick={() => onRemove(item)}
                aria-label={t("common.delete")}
              >
                <X size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
        ))}
      </div>
      {items.length > SEARCH_HISTORY_PAGE_SIZE ? (
        <Group justify="flex-end" mt="sm">
          <Pagination
            size="sm"
            total={Math.ceil(items.length / SEARCH_HISTORY_PAGE_SIZE)}
            value={page}
            onChange={onPageChange}
          />
        </Group>
      ) : null}
    </Card>
  );
}

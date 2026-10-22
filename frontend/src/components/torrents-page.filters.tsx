"use client";

import { Card, Group, TextInput } from "@mantine/core";
import { Search } from "lucide-react";

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

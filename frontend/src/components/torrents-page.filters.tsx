"use client";

import { Accordion, Badge, Card, Checkbox, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { Search } from "lucide-react";

type FilterOption = {
  value: string;
  label: string;
  count: number;
};

type AggregationOption = {
  value: string;
  label: string;
  count: number;
};

type TorrentFiltersSidebarProps = {
  t: (key: string) => string;
  search: string;
  contentTypeFilters: string[];
  tagFilters: string[];
  contentTypeOptions: FilterOption[];
  tagOptions: AggregationOption[];
  onSearchChange: (value: string) => void;
  onCommitSearch: () => void;
  onChangeContentTypes: (value: string[]) => void;
  onChangeTags: (value: string[]) => void;
};

export function TorrentFiltersSidebar({
  t,
  search,
  contentTypeFilters,
  tagFilters,
  contentTypeOptions,
  tagOptions,
  onSearchChange,
  onCommitSearch,
  onChangeContentTypes,
  onChangeTags
}: TorrentFiltersSidebarProps) {
  return (
    <Card className="glass-card torrent-filter-sidebar" withBorder w={{ base: "100%", lg: 320 }}>
      <Accordion className="torrents-filters" multiple defaultValue={["searchSort", "contentType", "source", "tag"]}>
        <Accordion.Item value="searchSort">
          <Accordion.Control>{t("torrents.search")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <TextInput
                mt={8}
                leftSection={<Search size={16} />}
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="contentType">
          <Accordion.Control>{t("torrents.contentType")}</Accordion.Control>
          <Accordion.Panel>
            <Checkbox.Group mt={8} value={contentTypeFilters} onChange={onChangeContentTypes}>
              <Stack gap={8}>
                {contentTypeOptions.map((item) => (
                  <Checkbox
                    key={item.value}
                    value={item.value}
                    label={
                      <span className="filter-option-label">
                        <Text size="sm">{item.label}</Text>
                        <Badge size="xs" variant="light" className="filter-option-count">{item.count}</Badge>
                      </span>
                    }
                  />
                ))}
              </Stack>
            </Checkbox.Group>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="tag">
          <Accordion.Control>{t("torrents.tagFilter")}</Accordion.Control>
          <Accordion.Panel>
            {tagOptions.length === 0 ? (
              <Text size="sm" c="dimmed">{t("torrents.noFilterOptions")}</Text>
            ) : (
              <ScrollArea.Autosize mah={280} offsetScrollbars>
                <Checkbox.Group mt={8} value={tagFilters} onChange={onChangeTags}>
                  <Stack gap={8}>
                    {tagOptions.map((item) => (
                      <Checkbox
                        key={item.value}
                        value={item.value}
                        label={
                          <span className="filter-option-label">
                            <Text size="sm" lineClamp={1}>{item.label}</Text>
                            <Badge size="xs" variant="light" className="filter-option-count">{item.count}</Badge>
                          </span>
                        }
                      />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ScrollArea.Autosize>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  );
}

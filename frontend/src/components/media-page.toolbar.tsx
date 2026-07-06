"use client";

import { ActionIcon, Card, Group, RangeSlider, Text, TextInput, Tooltip } from "@mantine/core";
import { ChevronDown, FilterX, HardDriveDownload, RefreshCw, Search } from "lucide-react";
import { FilterRow } from "./media-page.filter-row";
import type { FilterOption, FilterRowKey } from "./media-page.helpers";

type MediaToolbarProps = {
  t: (key: string) => string;
  searchInput: string;
  cache: string;
  showAdvancedFilters: boolean;
  expandedRows: Record<FilterRowKey, boolean>;
  enabledFilterKeys: Set<FilterRowKey>;
  values: {
    quality: string;
    year: string;
    genre: string;
    language: string;
    country: string;
    network: string;
    studio: string;
    awards: string;
    sort: string;
  };
  scoreRange: [number, number];
  options: {
    quality: FilterOption[];
    year: FilterOption[];
    genre: FilterOption[];
    language: FilterOption[];
    country: FilterOption[];
    network: FilterOption[];
    studio: FilterOption[];
    awards: FilterOption[];
    sort: FilterOption[];
  };
  onSearchChange: (value: string) => void;
  onCommitSearch: () => void;
  onToggleCache: () => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onToggleAdvancedFilters: () => void;
  onToggleExpanded: (key: FilterRowKey) => void;
  onSelectFilter: (key: FilterRowKey, value: string) => void;
  onScoreRangeChange: (value: [number, number]) => void;
  onScoreRangeCommit: (value: [number, number]) => void;
};

export function MediaToolbar({
  t,
  searchInput,
  cache,
  showAdvancedFilters,
  expandedRows,
  enabledFilterKeys,
  values,
  scoreRange,
  options,
  onSearchChange,
  onCommitSearch,
  onToggleCache,
  onClearFilters,
  onRefresh,
  onToggleAdvancedFilters,
  onToggleExpanded,
  onSelectFilter,
  onScoreRangeChange,
  onScoreRangeCommit
}: MediaToolbarProps) {
  return (
    <Card className="glass-card media-toolbar media-toolbar-rich" withBorder>
      <div className="media-toolbar-actions">
        <TextInput
          leftSection={<Search size={16} />}
          placeholder={t("media.search")}
          value={searchInput}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          onBlur={onCommitSearch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitSearch();
              event.currentTarget.blur();
            }
          }}
          className="media-toolbar-search"
        />
        <Group gap="xs">
          <Tooltip label={t("media.cacheBadge")} withArrow>
            <ActionIcon
              className="app-icon-btn"
              variant={cache === "cached" ? "light" : "default"}
              color={cache === "cached" ? "orange" : undefined}
              size={36}
              onClick={onToggleCache}
              aria-label={t("media.cacheBadge")}
              title={t("media.cacheBadge")}
            >
              <HardDriveDownload size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("media.clearFilters")} withArrow>
            <ActionIcon
              className="app-icon-btn"
              variant="default"
              size={36}
              onClick={onClearFilters}
              aria-label={t("media.clearFilters")}
              title={t("media.clearFilters")}
            >
              <FilterX size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("common.refresh")} withArrow>
            <ActionIcon
              className="app-icon-btn"
              variant="default"
              size={36}
              onClick={onRefresh}
              aria-label={t("common.refresh")}
              title={t("common.refresh")}
            >
              <RefreshCw size={16} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            className="app-icon-btn media-advanced-toggle"
            data-expanded={showAdvancedFilters ? "true" : "false"}
            variant="default"
            size={36}
            onClick={onToggleAdvancedFilters}
            aria-label={showAdvancedFilters ? t("media.collapseFilters") : t("media.expandFilters")}
          >
            <ChevronDown size={16} />
          </ActionIcon>
        </Group>
      </div>

      {showAdvancedFilters ? (
        <div className="media-advanced-filters media-advanced-filters-open">
          <div className="media-advanced-filters-inner">
            <FilterRow
              label={t("media.filters.quality")}
              currentValue={values.quality}
              options={options.quality}
              expanded={expandedRows.quality}
              onToggleExpand={() => onToggleExpanded("quality")}
              onSelect={(value) => onSelectFilter("quality", value)}
            />
            <FilterRow
              label={t("media.filters.year")}
              currentValue={values.year}
              options={options.year}
              expanded={expandedRows.year}
              onToggleExpand={() => onToggleExpanded("year")}
              onSelect={(value) => onSelectFilter("year", value)}
            />
            <FilterRow
              label={t("media.filters.genre")}
              currentValue={values.genre}
              options={options.genre}
              expanded={expandedRows.genre}
              onToggleExpand={() => onToggleExpanded("genre")}
              onSelect={(value) => onSelectFilter("genre", value)}
            />
            <FilterRow
              label={t("media.filters.language")}
              currentValue={values.language}
              options={options.language}
              expanded={expandedRows.language}
              onToggleExpand={() => onToggleExpanded("language")}
              onSelect={(value) => onSelectFilter("language", value)}
            />
            {enabledFilterKeys.has("country") ? (
              <FilterRow
                label={t("media.filters.country")}
                currentValue={values.country}
                options={options.country}
                expanded={expandedRows.country}
                onToggleExpand={() => onToggleExpanded("country")}
                onSelect={(value) => onSelectFilter("country", value)}
              />
            ) : null}
            {enabledFilterKeys.has("network") ? (
              <FilterRow
                label={t("media.filters.network")}
                currentValue={values.network}
                options={options.network}
                expanded={expandedRows.network}
                onToggleExpand={() => onToggleExpanded("network")}
                onSelect={(value) => onSelectFilter("network", value)}
              />
            ) : null}
            {enabledFilterKeys.has("studio") ? (
              <FilterRow
                label={t("media.filters.studio")}
                currentValue={values.studio}
                options={options.studio}
                expanded={expandedRows.studio}
                onToggleExpand={() => onToggleExpanded("studio")}
                onSelect={(value) => onSelectFilter("studio", value)}
              />
            ) : null}
            {enabledFilterKeys.has("awards") ? (
              <FilterRow
                label={t("media.filters.awards")}
                currentValue={values.awards}
                options={options.awards}
                expanded={expandedRows.awards}
                onToggleExpand={() => onToggleExpanded("awards")}
                onSelect={(value) => onSelectFilter("awards", value)}
              />
            ) : null}
            <FilterRow
              label={t("media.filters.sort")}
              currentValue={values.sort}
              options={options.sort}
              expanded={expandedRows.sort}
              onToggleExpand={() => onToggleExpanded("sort")}
              onSelect={(value) => onSelectFilter("sort", value)}
            />
            <div className="media-filter-row media-score-filter-row">
              <div className="media-filter-label">{t("media.filters.rating")}</div>
              <div className="media-score-filter">
                <RangeSlider
                  className="media-score-filter-slider"
                  min={0}
                  max={10}
                  step={0.1}
                  minRange={0}
                  value={scoreRange}
                  onChange={onScoreRangeChange}
                  onChangeEnd={onScoreRangeCommit}
                  label={(value) => value.toFixed(1)}
                />
                <Text className="media-score-filter-value" size="xs" c="dimmed">
                  {scoreRange[0].toFixed(1)} - {scoreRange[1].toFixed(1)}
                </Text>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

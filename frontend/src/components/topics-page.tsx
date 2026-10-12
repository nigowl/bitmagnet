"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Group, Loader, Pagination, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { ArrowLeft, Layers3, Pencil, Search } from "lucide-react";
import { useAuth } from "@/auth/provider";
import { useAuthDialog } from "@/auth/dialog";
import { CoverImage } from "@/components/cover-image";
import { MediaResultsSection } from "@/components/media-page.results";
import { TopicEditorModal, type TopicEditor } from "@/components/topic-editor-modal";
import { useI18n } from "@/languages/provider";
import {
  fetchAdminTopic,
  fetchMediaTopicDetail,
  fetchMediaTopics,
  type MediaTopic,
  type MediaTopicAdminItem,
  type MediaListItem
} from "@/lib/media-api";
import { notifications } from "@mantine/notifications";
import { parsePositiveIntParam } from "@/lib/url-params";
import { getDisplayTitle, getPosterUrl } from "@/lib/media";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { MEDIA_LIST_TARGET_COUNT, resolveAdaptiveMediaListCount } from "./media-page.helpers";

const TOPIC_PAGE_TARGET_COUNT = MEDIA_LIST_TARGET_COUNT;
const TOPIC_DETAIL_PAGE_SIZE = 40;

export function TopicsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [topics, setTopics] = useState<MediaTopic[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const page = parsePositiveIntParam(searchParams.get("page"), 1);
  const search = searchParams.get("search") || "";
  const sortParam = searchParams.get("sort") || "members";
  const sort = sortParam === "updated" || sortParam === "name" ? sortParam : "members";
  const [searchInput, setSearchInput] = useState(search);
  const pageSizeFromURL = parsePositiveIntParam(searchParams.get("limit"), 0);
  const [pageSize, setPageSize] = useState(pageSizeFromURL || TOPIC_PAGE_TARGET_COUNT);
  const [topicLayoutElement, setTopicLayoutElement] = useState<HTMLDivElement | null>(null);
  const [loadedPageSize, setLoadedPageSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const setTopicLayoutRef = useCallback((node: HTMLDivElement | null) => {
    setTopicLayoutElement(node);
  }, []);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const applySearch = useCallback(() => {
    const nextSearch = searchInput.trim();
    if (nextSearch === search) return;
    updateQuery({ search: nextSearch || null, page: "1" });
  }, [search, searchInput, updateQuery]);

  useLayoutEffect(() => {
    const element = topicLayoutElement;
    if (!element) return;

    let frameId: number | null = null;
    const updatePageSize = () => {
      const next = resolveAdaptiveMediaListCount(element.clientWidth, TOPIC_PAGE_TARGET_COUNT);
      if (next !== pageSize) setLoading(true);
      setPageSize((current) => (current === next ? current : next));
      if (String(next) !== searchParams.get("limit")) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("limit", String(next));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    };
    const scheduleUpdate = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updatePageSize();
      });
    };

    scheduleUpdate();
    const settleTimer = window.setTimeout(scheduleUpdate, 0);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    } else {
      window.addEventListener("resize", scheduleUpdate, { passive: true });
    }

    return () => {
      window.clearTimeout(settleTimer);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", scheduleUpdate);
    };
  }, [pageSize, pathname, router, searchParams, topicLayoutElement]);

  useEffect(() => {
    let active = true;
    void fetchMediaTopics({ search, sort, limit: pageSize, page })
      .then((result) => {
        if (!active) return;
        setTopics(result.items);
        setTotalCount(result.totalCount);
        setLoadedPageSize(pageSize);
      })
      .catch(() => {
        if (!active) return;
        setTopics([]);
        setTotalCount(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, search, sort]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [pageSize, totalCount]);
  const titleLanguage = locale === "en" ? "en" : "zh";

  useEffect(() => {
    if (loading || loadedPageSize !== pageSize || page <= totalPages) return;
    updateQuery({ page: String(totalPages) });
  }, [loadedPageSize, loading, page, pageSize, totalPages, updateQuery]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Title order={2} className="page-title">{t("topics.title")}</Title>
          <Text c="dimmed" className="page-subtitle">{t("topics.subtitle")}</Text>
        </Stack>
        <Group gap="sm" align="flex-end" wrap="wrap" maw="100%">
          <TextInput
            leftSection={<Search size={16} />}
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            onBlur={applySearch}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
            placeholder={t("topics.searchPlaceholder")}
            aria-label={t("topics.search")}
            w={320}
            maw="100%"
          />
          <Select
            aria-label={t("topics.sort.label")}
            data={[
              { value: "updated", label: t("topics.sort.updated") },
              { value: "name", label: t("topics.sort.name") },
              { value: "members", label: t("topics.sort.members") }
            ]}
            value={sort}
            onChange={(value) => {
              setLoading(true);
              updateQuery({ sort: value === "members" ? null : value, page: "1" });
            }}
            w={220}
            maw="100%"
          />
        </Group>
      </Group>

      {loading ? (
        <Card className="glass-card" withBorder>
          <Group justify="center" py="xl"><Loader /></Group>
        </Card>
      ) : topics.length === 0 ? (
        <Card className="glass-card" withBorder>
          <Text c="dimmed">{t("topics.empty")}</Text>
        </Card>
      ) : (
        <>
          <div ref={setTopicLayoutRef} className="media-wall">
            {topics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                titleLanguage={titleLanguage}
                locale={locale}
                t={t}
              />
            ))}
          </div>
          <Card className="glass-card media-toolbar-pagination" withBorder>
            <Group justify="space-between" wrap="wrap">
              <Text c="dimmed" size="sm">{t("media.results")}: {totalCount} / Page {page}</Text>
              <Pagination
                total={totalPages}
                value={page}
                onChange={(nextPage) => {
                  setLoading(true);
                  updateQuery({ page: String(nextPage) });
                }}
                siblings={1}
                boundaries={1}
              />
            </Group>
          </Card>
        </>
      )}
    </Stack>
  );
}

function TopicCard({
  topic,
  titleLanguage,
  locale,
  t
}: {
  topic: MediaTopic;
  titleLanguage: "zh" | "en";
  locale: string;
  t: (key: string) => string;
}) {
  const previews = topic.previews.slice(0, 3);
  const coverCount = Math.max(1, previews.length);
  const description = topicCardDescription(topic);

  return (
    <Link href={`/topics/${encodeURIComponent(topic.id)}`} className="unstyled-link">
      <div className="media-wall-item">
        <article className="media-wall-card topic-wall-card">
          <div
            className="topic-card-covers"
            style={{ gridTemplateColumns: `repeat(${coverCount}, minmax(0, 1fr))` }}
          >
            <Badge className="topic-card-type-badge" variant="filled" color="orange">
              {topicTypeLabel(topic, t)}
            </Badge>
            {previews.map((item) => {
              const poster = getPosterUrl(item, "md");
              const title = getDisplayTitle(item, titleLanguage);
              return poster ? (
                <CoverImage
                  key={item.id}
                  className="topic-card-cover"
                  src={poster}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div key={item.id} className="topic-card-cover topic-card-cover-fallback">
                  <Layers3 size={22} />
                </div>
              );
            })}
            <div className="topic-card-member-count">
              {topic.itemCount} {t("topics.manage.media")}
            </div>
          </div>
          <div className="media-wall-content">
            <div className="media-wall-title">{topicLabel(topic, t)}</div>
            <div className="media-wall-facts topic-card-updated-at">
              {formatRelativeTime(topic.updatedAt, locale)}
            </div>
            {description ? (
              <div className="media-wall-meta">
                <span className="media-mini-chip topic-card-description">{description}</span>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </Link>
  );
}

function topicTypeLabel(topic: MediaTopic, t: (key: string) => string): string {
  const moduleKey = topic.module || (topic.kind === "franchise" ? "series" : topic.kind === "custom" ? "custom" : "popular");
  return topicModuleLabel(moduleKey, t);
}

function topicLabel(topic: MediaTopic, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    "curated:high-rated-movies": t("topics.builtIn.highRatedMovies"),
    "curated:popular-movies": t("topics.builtIn.popularMovies"),
    "curated:popular-series": t("topics.builtIn.popularSeries"),
    "curated:award-winning": t("topics.builtIn.awardWinning")
  };
  return labels[topic.id] || topic.name;
}

function topicDescription(topic: MediaTopic): string {
  return topic.description.trim();
}

function topicCardDescription(topic: MediaTopic): string {
  return topicDescription(topic);
}

function topicModuleLabel(moduleKey: string, t: (key: string) => string): string {
  const key = `topics.modules.${moduleKey}`;
  const label = t(key);
  return label === key ? moduleKey : label;
}

function decodeTopicID(value?: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function TopicDetailPage() {
  const { t, locale } = useI18n();
  const { user, isAdmin } = useAuth();
  const { openLogin } = useAuthDialog();
  const params = useParams<{ topicId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const rawTopicID = Array.isArray(params.topicId) ? params.topicId[0] : params.topicId;
  const topicID = decodeTopicID(rawTopicID);
  const [topic, setTopic] = useState<MediaTopic | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<TopicEditor | null>(null);

  useEffect(() => {
    let active = true;
    void fetchMediaTopicDetail(topicID, { limit: TOPIC_DETAIL_PAGE_SIZE, page })
      .then((result) => {
        if (!active) return;
        setTopic(result.topic);
        setItems(result.items);
        setTotalCount(result.totalCount);
      })
      .catch(() => {
        if (active) {
          setTopic(null);
          setItems([]);
          setTotalCount(0);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, topicID]);

  const titleLanguage = locale === "en" ? "en" : "zh";
  const totalPages = Math.max(1, Math.ceil(totalCount / TOPIC_DETAIL_PAGE_SIZE));
  const description = topic ? topicDescription(topic) : "";

  const openTopicEdit = async () => {
    if (!user || !isAdmin) {
      openLogin();
      return;
    }
    try {
      const adminTopic = await fetchAdminTopic(topicID);
      setEditor({
        id: adminTopic.id,
        name: adminTopic.name,
        description: adminTopic.description,
        sortOrder: adminTopic.sortOrder,
        mediaIds: adminTopic.mediaIds,
        enabled: adminTopic.enabled
      });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleTopicSaved = (saved: MediaTopicAdminItem) => {
    setTopic((current) => current ? {
      ...current,
      name: saved.name,
      description: saved.description,
      itemCount: saved.itemCount,
      enabled: saved.enabled,
      updatedAt: saved.updatedAt
    } : current);
  };

  if (loading && !topic) {
    return <Group justify="center" py="xl"><Loader /></Group>;
  }

  if (!topic) {
    return (
      <Card className="glass-card" withBorder>
        <Text c="dimmed">{t("topics.notFound")}</Text>
      </Card>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={4}>
          <Title order={2} className="page-title">{topicLabel(topic, t)}</Title>
          {description ? <Text c="dimmed" className="page-subtitle">{description}</Text> : null}
          <Text c="dimmed" size="sm">{formatDateTime(topic.updatedAt)}</Text>
        </Stack>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<ArrowLeft size={15} />}
            onClick={() => router.push("/topics")}
          >
            {t("common.back")}
          </Button>
          {isAdmin ? (
            <Button
              variant="default"
              leftSection={<Pencil size={15} />}
              onClick={() => void openTopicEdit()}
            >
              {t("topics.edit")}
            </Button>
          ) : null}
        </Group>
      </Group>

      <MediaResultsSection
        t={t}
        loading={loading}
        items={items}
        titleLanguage={titleLanguage}
        currentListHref={pathname}
        totalCount={totalCount}
        page={page}
        totalPages={totalPages}
        onChangePage={(nextPage) => {
          setLoading(true);
          setPage(nextPage);
        }}
      />
      <TopicEditorModal
        opened={editor !== null}
        editor={editor}
        onChange={setEditor}
        onClose={() => setEditor(null)}
        onSaved={handleTopicSaved}
      />
    </Stack>
  );
}

import type { Metadata } from "next";
import { TorrentsPage } from "@/components/torrents-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "种子检索",
  description: "在 bitmagnet（比特磁铁）进行高效种子检索，支持多维筛选与详情联动。",
  keywords: ["bitmagnet", "比特磁铁", "种子检索", "Torrent", "筛选", "资源搜索"],
  path: "/torrents"
});

type TorrentsRouteProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function TorrentsRoutePage({ searchParams }: TorrentsRouteProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = resolved?.q;
  const initialQuery = Array.isArray(query) ? query[0] : query;

  return <TorrentsPage initialQuery={initialQuery || ""} />;
}

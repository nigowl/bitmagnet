import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "电影",
  description: "浏览电影资源，支持按画质、年份、题材、平台与奖项快速筛选。",
  keywords: ["bitmagnet", "比特磁铁", "电影", "电影资源", "画质筛选", "高分电影"],
  path: "/media/movie"
});

export default function MovieMediaRoutePage() {
  return <MediaPage fixedCategory="movie" />;
}


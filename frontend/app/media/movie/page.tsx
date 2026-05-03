import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "电影",
  description: "电影资源页，支持按画质、年份、题材与奖项快速筛选并进入播放。",
  keywords: ["bitmagnet", "比特磁铁", "电影", "影视库", "画质筛选", "在线播放"],
  path: "/media/movie"
});

export default function MovieMediaRoutePage() {
  return <MediaPage fixedCategory="movie" />;
}

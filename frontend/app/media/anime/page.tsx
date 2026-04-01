import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "动画",
  description: "浏览动画与番剧资源，支持多维筛选与高画质条目快速定位。",
  keywords: ["bitmagnet", "比特磁铁", "动画", "番剧", "Anime", "动画资源"],
  path: "/media/anime"
});

export default function AnimeMediaRoutePage() {
  return <MediaPage fixedCategory="anime" />;
}


import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "动画",
  description: "动画与番剧资源页，支持多维筛选与高画质条目快速定位。",
  keywords: ["bitmagnet", "比特磁铁", "动画", "番剧", "影视库", "在线播放"],
  path: "/media/anime"
});

export default function AnimeMediaRoutePage() {
  return <MediaPage fixedCategory="anime" />;
}

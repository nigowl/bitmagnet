import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "剧集",
  description: "剧集资源页，聚合条目、质量信息与可播放资源。",
  keywords: ["bitmagnet", "比特磁铁", "剧集", "影视库", "追剧", "在线播放"],
  path: "/media/series"
});

export default function SeriesMediaRoutePage() {
  return <MediaPage fixedCategory="series" />;
}

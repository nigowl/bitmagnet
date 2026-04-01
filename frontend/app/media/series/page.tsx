import type { Metadata } from "next";
import { MediaPage } from "@/components/media-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "剧集",
  description: "浏览剧集资源，聚合热门美剧、英剧、亚洲剧与流媒体剧集条目。",
  keywords: ["bitmagnet", "比特磁铁", "剧集", "电视剧", "流媒体", "追剧"],
  path: "/media/series"
});

export default function SeriesMediaRoutePage() {
  return <MediaPage fixedCategory="series" />;
}


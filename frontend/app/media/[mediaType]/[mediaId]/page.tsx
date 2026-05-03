import type { Metadata } from "next";
import { MediaDetailPage } from "@/components/media-detail-page";
import { buildMetadata } from "@/lib/seo";

type MediaDetailRouteProps = {
  params: Promise<{
    mediaType: string;
    mediaId: string;
  }>;
};

function normalizeMediaType(rawType: string): "movie" | "series" | "anime" {
  if (rawType === "anime") return "anime";
  if (rawType === "series") return "series";
  return "movie";
}

function mediaTypeLabel(type: "movie" | "series" | "anime"): string {
  if (type === "anime") return "动画";
  if (type === "series") return "剧集";
  return "电影";
}

export async function generateMetadata({ params }: MediaDetailRouteProps): Promise<Metadata> {
  const resolved = await params;
  const mediaType = normalizeMediaType(resolved.mediaType);

  return buildMetadata({
    title: `${mediaTypeLabel(mediaType)}详情 ${resolved.mediaId.slice(0, 10)}`,
    description: "查看影视库的详情、外部站点映射与种子快照信息。",
    keywords: ["bitmagnet", "比特磁铁", "影视库", "影视详情", "种子快照", "TMDB", "IMDb", "豆瓣"],
    path: `/media/${mediaType}/${resolved.mediaId}`
  });
}

export default async function MediaDetailByTypeRoutePage({ params }: MediaDetailRouteProps) {
  const resolved = await params;
  const mediaType = normalizeMediaType(resolved.mediaType);
  return <MediaDetailPage mediaId={resolved.mediaId} mediaType={mediaType} />;
}

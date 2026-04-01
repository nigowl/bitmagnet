import type { Metadata } from "next";
import { TorrentDetailPage } from "@/components/torrent-detail-page";
import { buildMetadata } from "@/lib/seo";

type TorrentDetailRouteProps = {
  params: Promise<{
    infoHash: string;
  }>;
};

export async function generateMetadata({ params }: TorrentDetailRouteProps): Promise<Metadata> {
  const resolved = await params;

  return buildMetadata({
    title: `种子详情 ${resolved.infoHash.slice(0, 10)}`,
    description: "查看种子详情、文件信息与标签元数据。",
    keywords: ["bitmagnet", "比特磁铁", "种子详情", "InfoHash", "文件列表"],
    path: `/torrents/${resolved.infoHash}`
  });
}

export default async function TorrentDetailRoutePage({ params }: TorrentDetailRouteProps) {
  const resolved = await params;
  return <TorrentDetailPage infoHash={resolved.infoHash} />;
}

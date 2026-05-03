import type { Metadata } from "next";
import { TorrentPlayerPage } from "@/components/torrent-player-page";
import { buildMetadata } from "@/lib/seo";

type PlayerRouteProps = {
  params: Promise<{
    infoHash: string;
  }>;
};

export async function generateMetadata({ params }: PlayerRouteProps): Promise<Metadata> {
  const resolved = await params;
  const infoHash = resolved.infoHash.trim().toLowerCase();

  return buildMetadata({
    title: `在线播放 ${infoHash.slice(0, 10)}`,
    description: "面向影视库的在线播放页面，使用 Plyr + Transmission + FFmpeg 进行流式播放。",
    keywords: ["bitmagnet", "比特磁铁", "Plyr", "Transmission", "FFmpeg", "影视库", "在线播放"],
    path: `/player/${infoHash}`,
    noIndex: true
  });
}

export default async function PlayerRoutePage({ params }: PlayerRouteProps) {
  const resolved = await params;
  return <TorrentPlayerPage infoHash={resolved.infoHash} />;
}

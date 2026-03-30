import { TorrentDetailPage } from "@/components/torrent-detail-page";

type TorrentDetailRouteProps = {
  params: Promise<{
    infoHash: string;
  }>;
};

export default async function TorrentDetailRoutePage({ params }: TorrentDetailRouteProps) {
  const resolved = await params;
  return <TorrentDetailPage infoHash={resolved.infoHash} />;
}

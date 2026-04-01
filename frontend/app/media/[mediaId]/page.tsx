import { MediaDetailPage } from "@/components/media-detail-page";

type MediaDetailRouteProps = {
  params: Promise<{
    mediaId: string;
  }>;
};

export default async function MediaDetailRoutePage({ params }: MediaDetailRouteProps) {
  const resolved = await params;
  return <MediaDetailPage mediaId={resolved.mediaId} />;
}

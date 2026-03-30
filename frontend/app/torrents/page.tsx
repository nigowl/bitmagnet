import { TorrentsPage } from "@/components/torrents-page";

type TorrentsRouteProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function TorrentsRoutePage({ searchParams }: TorrentsRouteProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = resolved?.q;
  const initialQuery = Array.isArray(query) ? query[0] : query;

  return <TorrentsPage initialQuery={initialQuery || ""} />;
}

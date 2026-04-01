import type { Metadata } from "next";
import { FavoritesPage } from "@/components/favorites-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "我的收藏",
  description: "管理你在 bitmagnet（比特磁铁）中的收藏资源，按电影、剧集、动画分类查看。",
  keywords: ["bitmagnet", "比特磁铁", "我的收藏", "电影收藏", "剧集收藏", "动画收藏"],
  path: "/favorites",
  noIndex: true
});

export default function FavoritesRoutePage() {
  return <FavoritesPage />;
}


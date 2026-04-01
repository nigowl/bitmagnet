import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "首页",
  description: "bitmagnet（比特磁铁）首页，提供每日推荐、高分推荐与热门影视资源导览。",
  keywords: ["bitmagnet", "比特磁铁", "首页", "每日推荐", "高分推荐", "热门影视"],
  path: "/"
});

export default function HomeRoutePage() {
  return <HomePage />;
}

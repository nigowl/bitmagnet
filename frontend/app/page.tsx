import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "首页",
  description: "bitmagnet（比特磁铁）首页，统一进入影视播放、种子检索与收藏管理。",
  keywords: ["bitmagnet", "比特磁铁", "影视库", "影视播放", "种子检索", "收藏管理"],
  path: "/"
});

export default function HomeRoutePage() {
  return <HomePage />;
}

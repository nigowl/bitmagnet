import type { Metadata } from "next";
import { TorrentsPage } from "@/components/torrents-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "种子检索",
  description: "面向影视库的种子检索页面，支持多维筛选、详情联动与在线播放跳转。",
  keywords: ["bitmagnet", "比特磁铁", "种子检索", "影视库", "在线播放"],
  path: "/torrents"
});

export default function TorrentsRoutePage() {
  return <TorrentsPage />;
}

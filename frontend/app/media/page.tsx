import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "影视",
  description: "影视库分类入口，按电影、剧集与动画组织播放和检索体验。",
  keywords: ["bitmagnet", "比特磁铁", "影视库", "电影", "剧集", "动画"],
  path: "/media"
});

export default function MediaRoutePage() {
  redirect("/media/movie");
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "影视",
  description: "影视分类入口，已按目录路由拆分为电影、剧集与动画。",
  keywords: ["bitmagnet", "比特磁铁", "影视", "电影", "剧集", "动画"],
  path: "/media"
});

export default function MediaRoutePage() {
  redirect("/media/movie");
}

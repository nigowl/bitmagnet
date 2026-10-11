import type { Metadata } from "next";
import { TopicsPage } from "@/components/topics-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "专题",
  description: "按高分、热门与电影系列组织影视内容。",
  keywords: ["bitmagnet", "专题", "电影系列", "高分电影", "热门影视"],
  path: "/topics"
});

export default function TopicsRoutePage() {
  return <TopicsPage />;
}

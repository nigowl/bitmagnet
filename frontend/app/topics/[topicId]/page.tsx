import type { Metadata } from "next";
import { TopicDetailPage } from "@/components/topics-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "专题详情",
  description: "查看专题中的影视成员。",
  keywords: ["bitmagnet", "专题详情", "影视系列"],
  path: "/topics"
});

export default function TopicDetailRoutePage() {
  return <TopicDetailPage />;
}

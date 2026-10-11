import type { Metadata } from "next";
import { TopicsManagementPage } from "@/components/topics-management-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "专题",
  description: "管理员手动维护专题及其媒体成员。",
  keywords: ["bitmagnet", "专题", "媒体专题"],
  path: "/admin/topics",
  noIndex: true
});

export default function TopicsManagementRoutePage() {
  return <TopicsManagementPage />;
}

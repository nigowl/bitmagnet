import type { Metadata } from "next";
import { QueuePage } from "@/components/queue-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "队列管理",
  description: "统一管理 bitmagnet（比特磁铁）任务队列，查看待处理、失败和已完成任务。",
  keywords: ["bitmagnet", "比特磁铁", "队列管理", "任务队列", "批量处理"],
  path: "/queue",
  noIndex: true
});

export default function QueueRoutePage() {
  return <QueuePage />;
}

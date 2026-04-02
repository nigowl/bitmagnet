import type { Metadata } from "next";
import { LogsPage } from "@/components/logs-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "系统日志",
  description: "查看 bitmagnet（比特磁铁）系统日志，按分类与文件筛选定位问题。",
  keywords: ["bitmagnet", "比特磁铁", "日志", "运维", "排障"],
  path: "/logs",
  noIndex: true
});

export default function LogsRoutePage() {
  return <LogsPage />;
}

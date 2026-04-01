import type { Metadata } from "next";
import { MonitorPage } from "@/components/monitor-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "监控",
  description: "查看 bitmagnet（比特磁铁）系统健康状态、指标趋势与运行情况。",
  keywords: ["bitmagnet", "比特磁铁", "监控", "系统健康", "运行指标"],
  path: "/monitor",
  noIndex: true
});

export default function MonitorRoutePage() {
  return <MonitorPage />;
}

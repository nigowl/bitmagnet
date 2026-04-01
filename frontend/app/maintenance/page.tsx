import type { Metadata } from "next";
import { MaintenancePage } from "@/components/maintenance-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "维护",
  description: "管理员维护页面，可执行影视双语修复与封面缓存修复任务并查看实时进度。",
  keywords: ["bitmagnet", "比特磁铁", "维护", "双语修复", "封面缓存", "管理员任务"],
  path: "/maintenance",
  noIndex: true
});

export default function MaintenanceRoutePage() {
  return <MaintenancePage />;
}


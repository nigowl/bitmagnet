import type { Metadata } from "next";
import { MaintenancePage } from "@/components/maintenance-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "维护",
  description: "管理员维护页面，可执行维护任务并管理 Transmission 任务清理。",
  keywords: ["bitmagnet", "比特磁铁", "维护", "双语修复", "封面缓存", "Transmission", "管理员任务"],
  path: "/maintenance",
  noIndex: true
});

export default function MaintenanceRoutePage() {
  return <MaintenancePage />;
}

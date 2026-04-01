import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "系统设置",
  description: "配置 bitmagnet（比特磁铁）系统参数、日志等级与影视外站插件能力。",
  keywords: ["bitmagnet", "比特磁铁", "系统设置", "日志", "插件", "Douban", "TMDB", "IMDb"],
  path: "/settings",
  noIndex: true
});

export default function SettingsRoutePage() {
  return <SettingsPage />;
}

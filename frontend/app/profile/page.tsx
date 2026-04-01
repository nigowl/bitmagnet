import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "用户中心",
  description: "管理 bitmagnet（比特磁铁）账户信息、收藏内容与安全设置。",
  keywords: ["bitmagnet", "比特磁铁", "用户中心", "收藏", "安全设置"],
  path: "/profile",
  noIndex: true
});

export default function ProfileRoutePage() {
  return <ProfilePage />;
}

import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "登录",
  description: "登录 bitmagnet（比特磁铁）账户，访问收藏、用户中心与管理员功能。",
  keywords: ["bitmagnet", "比特磁铁", "登录", "用户账户", "管理员"],
  path: "/login",
  noIndex: true
});

export default function LoginRoutePage() {
  return <LoginPage />;
}

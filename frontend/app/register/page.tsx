import type { Metadata } from "next";
import { RegisterPage } from "@/components/register-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "注册",
  description: "创建 bitmagnet（比特磁铁）账户，开启个性化影视与种子管理体验。",
  keywords: ["bitmagnet", "比特磁铁", "注册", "账户创建"],
  path: "/register",
  noIndex: true
});

export default function RegisterRoutePage() {
  return <RegisterPage />;
}

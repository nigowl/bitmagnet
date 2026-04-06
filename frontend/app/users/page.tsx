import type { Metadata } from "next";
import { UsersPage } from "@/components/users-page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "用户管理",
  description: "管理站点用户与邀请码。",
  keywords: ["bitmagnet", "用户管理", "邀请码"],
  path: "/users",
  noIndex: true
});

export default function UsersRoutePage() {
  return <UsersPage />;
}

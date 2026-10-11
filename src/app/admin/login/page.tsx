import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { HexMark } from "@/components/brand/HexMark";
import { getConfig } from "@/server/config";
import { getAdminSession } from "@/server/security/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const config = getConfig();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-16">
      <HexMark size={32} />
      <h1 className="mt-6 text-2xl">Admin sign in</h1>
      <p className="mt-2 text-sm text-slate">{config.orgName}</p>
      {config.adminUsers.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-control)] bg-marigold-soft px-4 py-3 text-sm">
          No admin accounts are configured. Set ADMIN_USERS (see docs/DEPLOYMENT.md).
        </p>
      ) : (
        <LoginForm />
      )}
    </main>
  );
}

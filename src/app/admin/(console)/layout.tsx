import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/admin/AdminActions";
import { HexMark } from "@/components/brand/HexMark";
import { getConfig } from "@/server/config";
import { getAdminSession } from "@/server/security/admin-session";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const config = getConfig();
  return (
    <div className="min-h-dvh bg-mist">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 font-medium">
            <HexMark size={22} />
            <span>Admin</span>
          </Link>
          <span className="hidden text-sm text-slate sm:inline">{config.orgName}</span>
          {config.env !== "production" ? <span className="rounded-sm bg-marigold-soft px-2 py-0.5 text-xs font-medium">{config.env}</span> : null}
          <span className="ml-auto hidden text-sm text-slate sm:inline">{session.email}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}

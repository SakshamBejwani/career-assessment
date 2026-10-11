import Link from "next/link";
import { HexMark } from "../brand/HexMark";

export function SiteHeader({ orgName, compact = false }: { orgName: string; compact?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 font-medium text-ink">
        <HexMark size={26} />
        <span className="text-[0.95rem] leading-tight">{orgName}</span>
      </Link>
      {compact ? null : (
        <nav className="ml-auto hidden items-center gap-1 text-[0.95rem] text-slate sm:flex" aria-label="Main">
          <Link href="/#assessments" className="rounded-md px-3 py-2 hover:text-ink">
            Assessments
          </Link>
          <Link href="/#how-it-works" className="rounded-md px-3 py-2 hover:text-ink">
            How it works
          </Link>
        </nav>
      )}
    </header>
  );
}

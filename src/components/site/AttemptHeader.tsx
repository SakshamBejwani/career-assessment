import Link from "next/link";
import { HexMark } from "../brand/HexMark";

/** Minimal chrome for focused answering. */
const WIDTH = { narrow: "max-w-3xl", medium: "max-w-4xl", wide: "max-w-5xl" } as const;

export function AttemptHeader({ title, width = "narrow" }: { title: string; width?: keyof typeof WIDTH }) {
  return (
    <header className={`mx-auto flex h-[4.5rem] w-full ${WIDTH[width]} items-center gap-3 px-4 sm:px-6`}>
      <Link href="/" aria-label="Home" className="text-ink">
        <HexMark size={24} />
      </Link>
      <p className="font-display text-[0.95rem] font-semibold">{title}</p>
    </header>
  );
}

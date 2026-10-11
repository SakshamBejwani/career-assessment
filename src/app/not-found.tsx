import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl">Page not found</h1>
      <p className="mt-4 text-slate">The page you asked for doesn&apos;t exist or has moved.</p>
      <Link href="/" className="btn btn-primary mt-8">
        Go to the home page
      </Link>
    </main>
  );
}

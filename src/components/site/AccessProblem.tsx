import Link from "next/link";

export function AccessProblem() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl">We can&apos;t open this assessment</h1>
      <p className="mt-4 text-slate">
        Assessments open only in the browser where they were started. If you started on another device or cleared your browsing data, use the
        link in your report email, or contact us with your reference.
      </p>
      <Link href="/" className="btn btn-primary mt-8">
        Go to the home page
      </Link>
    </main>
  );
}

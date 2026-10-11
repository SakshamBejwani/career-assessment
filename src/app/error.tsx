"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-4 text-slate">
        This page couldn&apos;t load. Your answers and any payment are safe. Try again, and if it keeps happening, contact us
        {error.digest ? ` with reference ${error.digest}` : ""}.
      </p>
      <button type="button" className="btn btn-primary mt-8" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

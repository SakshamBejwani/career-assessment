"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/admin/session", { body: { email: form.get("email"), password: form.get("password") } });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.body.message : "Sign in failed. Try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label className="field-label" htmlFor="admin-email">
          Email
        </label>
        <input id="admin-email" name="email" type="email" autoComplete="username" required className="field-input" />
      </div>
      <div>
        <label className="field-label" htmlFor="admin-password">
          Password
        </label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required className="field-input" />
      </div>
      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-alert-soft px-4 py-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

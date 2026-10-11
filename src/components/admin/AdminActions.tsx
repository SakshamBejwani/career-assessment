"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-quiet min-h-0 py-2 text-sm"
      onClick={async () => {
        await api("/api/v1/admin/session", { method: "DELETE" }).catch(() => undefined);
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function ActionButton({ path, label, confirm, done }: { path: string; label: string; confirm?: string; done: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn btn-secondary min-h-0 px-3 py-1.5 text-sm"
        disabled={state.busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setState({ busy: true, message: null, error: false });
          try {
            await api(path, { body: {} });
            setState({ busy: false, message: done, error: false });
            setTimeout(() => router.refresh(), 1500);
          } catch (e) {
            setState({ busy: false, message: e instanceof ApiError ? e.body.message : "Action failed", error: true });
          }
        }}
      >
        {state.busy ? "Working…" : label}
      </button>
      {state.message ? (
        <span role="status" className={`text-xs ${state.error ? "text-alert" : "text-good"}`}>
          {state.message}
        </span>
      ) : null}
    </span>
  );
}

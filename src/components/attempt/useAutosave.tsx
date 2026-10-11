"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Answer, AnswerMap } from "@/lib/questionnaire-types";

export type SaveState = "idle" | "saving" | "saved" | "retrying" | "offline";

/**
 * Batches changed answers and PUTs them to the server. Failed saves are retried with backoff
 * and never discard local answers; `flush` is awaited before submitting.
 */
export function useAutosave(attemptId: string) {
  const pending = useRef<AnswerMap>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const failures = useRef(0);
  const [state, setState] = useState<SaveState>("idle");
  const sendRef = useRef<() => Promise<void>>(async () => {});

  const send = useCallback(async (): Promise<void> => {
    if (inflight.current) await inflight.current;
    const batch = pending.current;
    if (Object.keys(batch).length === 0) return;
    pending.current = {};
    setState("saving");
    const run = (async () => {
      try {
        await api(`/api/v1/attempts/${attemptId}/responses`, { method: "PUT", body: { answers: batch } });
        failures.current = 0;
        setState(Object.keys(pending.current).length ? "saving" : "saved");
      } catch {
        // Put the batch back underneath anything newer and retry later.
        pending.current = { ...batch, ...pending.current };
        failures.current += 1;
        setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "retrying");
        const delay = Math.min(30_000, 1000 * 2 ** failures.current);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void sendRef.current(), delay);
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }, [attemptId]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const queue = useCallback(
    (questionId: string, value: Answer) => {
      pending.current[questionId] = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), 700);
    },
    [send],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await send();
  }, [send]);

  useEffect(() => {
    const onLeave = () => {
      if (Object.keys(pending.current).length === 0) return;
      void fetch(`/api/v1/attempts/${attemptId}/responses`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: pending.current }),
        keepalive: true,
      });
    };
    const onOnline = () => void send();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attemptId, send]);

  return { queue, flush, state };
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const label: Record<SaveState, string> = {
    idle: "Autosave on",
    saving: "Saving…",
    saved: "Saved",
    retrying: "Not saved yet, retrying",
    offline: "Offline. Answers will save when you reconnect",
  };
  const tone = state === "retrying" || state === "offline" ? "text-alert" : "text-slate";
  return (
    <p className={`text-right text-sm ${tone}`} role="status" aria-live="polite">
      {label[state]}
    </p>
  );
}

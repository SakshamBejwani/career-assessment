import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { JobKind } from "@/lib/status";
import { getConfig, type OwnerEvent } from "../config";
import { getDb, type Tx } from "../db";

export interface NewJob {
  kind: JobKind;
  dedupeKey: string;
  attemptId?: string;
  reportId?: string;
  channel?: "email" | "whatsapp" | "owner_email";
  purpose?: string;
  payload?: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
}

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 2 * 3600_000;

/** 30s, 2m, 8m, 32m, then capped at 2h. */
export function backoffMs(attemptsSoFar: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 4 ** Math.max(0, attemptsSoFar - 1));
}

/**
 * Inserts jobs; duplicates (same dedupe_key) are silently ignored, which makes every
 * enqueue idempotent. Call inside the transaction that made the triggering state change.
 */
export async function enqueueJobs(jobs: NewJob[], tx?: Tx): Promise<void> {
  if (jobs.length === 0) return;
  const db = tx ?? getDb();
  await db.job.createMany({
    data: jobs.map((j) => ({
      kind: j.kind,
      dedupeKey: j.dedupeKey.slice(0, 191),
      attemptId: j.attemptId ?? null,
      reportId: j.reportId ?? null,
      channel: j.channel ?? null,
      purpose: j.purpose ?? null,
      payload: j.payload,
      status: "pending",
      runAt: j.runAt ?? new Date(),
      maxAttempts: j.maxAttempts ?? MAX_ATTEMPTS,
    })),
    skipDuplicates: true,
  });
}

/** Queues an owner notification if that event is enabled and a destination is configured. */
export async function emitOwnerEvent(
  event: OwnerEvent,
  ref: { attemptId: string; entityId?: string },
  tx?: Tx,
): Promise<void> {
  const { owner } = getConfig();
  if (!owner.events.has(event) || owner.emails.length === 0) return;
  await enqueueJobs(
    [
      {
        kind: "notify_owner",
        dedupeKey: `notify:${event}:${ref.entityId ?? ref.attemptId}`,
        attemptId: ref.attemptId,
        channel: "owner_email",
        purpose: event,
        payload: { event },
      },
    ],
    tx,
  );
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AttemptStatus } from "@/lib/status";
import { getDb, type Tx } from "../db";

/** Spec §5.3. Same-state "transitions" are allowed so retried jobs can re-enter their state. */
export const TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  awaiting_payment: ["in_progress", "cancelled"],
  in_progress: ["submitted", "cancelled"],
  submitted: ["scoring", "failed"],
  scoring: ["scored", "failed"],
  scored: ["report_generating", "failed"],
  report_generating: ["report_ready_locked", "failed"],
  report_ready_locked: ["report_unlocked"],
  report_unlocked: ["completed"],
  completed: [],
  cancelled: [],
  failed: ["submitted", "scored"],
};

export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/**
 * Guarded state change: only succeeds if the attempt is currently in one of `from`.
 * Returns true when this caller performed the change (so it may run follow-up effects).
 */
export async function transitionAttempt(
  attemptId: string,
  from: readonly AttemptStatus[],
  to: AttemptStatus,
  data: Omit<Prisma.AttemptUpdateManyMutationInput, "status"> = {},
  tx?: Tx,
): Promise<boolean> {
  for (const f of from) {
    if (!canTransition(f, to)) throw new Error(`Illegal transition ${f} -> ${to}`);
  }
  const db = tx ?? getDb();
  const { count } = await db.attempt.updateMany({
    where: { id: attemptId, status: { in: [...from] } },
    data: { ...data, status: to },
  });
  return count === 1;
}

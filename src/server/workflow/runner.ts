import "server-only";
import { after } from "next/server";
import type { Job } from "@/generated/prisma/client";
import type { JobKind } from "@/lib/status";
import { getDb } from "../db";
import { logger } from "../observability/logger";
import { backoffMs } from "./queue";
import { HANDLERS, onJobDead, type JobHandlerResult } from "./handlers";
import { JobError } from "./job-error";

const LOCK_MS = 2 * 60_000;
const DEFAULT_BUDGET_MS = 25_000;

export { JobError };

/** Claims one job atomically. Returns the claimed row, or null if someone else got it. */
async function claim(jobId: string): Promise<Job | null> {
  const db = getDb();
  const now = new Date();
  const { count } = await db.job.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ["pending", "failed"] }, runAt: { lte: now } },
        { status: "running", lockedUntil: { lt: now } }, // a crashed worker's lock has expired
      ],
    },
    data: { status: "running", lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
  });
  if (count !== 1) return null;
  return db.job.findUnique({ where: { id: jobId } });
}

async function finish(job: Job, result: JobHandlerResult) {
  await getDb().job.update({
    where: { id: job.id },
    data: {
      status: "succeeded",
      lockedUntil: null,
      completedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
      providerMessageId: result.providerMessageId ?? job.providerMessageId,
    },
  });
  logger.metric("job_succeeded", { kind: job.kind, attempts: job.attempts });
}

async function fail(job: Job, error: unknown) {
  const code = error instanceof JobError ? error.code : "transient_error";
  const permanent = error instanceof JobError && error.permanent;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const dead = permanent || job.attempts >= job.maxAttempts;
  await getDb().job.update({
    where: { id: job.id },
    data: {
      status: dead ? "dead" : "failed",
      lockedUntil: null,
      lastErrorCode: code,
      lastError: message,
      runAt: dead ? job.runAt : new Date(Date.now() + backoffMs(job.attempts)),
    },
  });
  logger.warn("job failed", { jobId: job.id, kind: job.kind, attempt: job.attempts, code, dead });
  logger.metric(dead ? "job_dead" : "job_retry_scheduled", { kind: job.kind });
  if (dead) {
    try {
      await onJobDead(job, code);
    } catch (hookError) {
      logger.error("job dead hook failed", { jobId: job.id, error: hookError });
    }
  }
}

export async function runJob(job: Job): Promise<void> {
  const handler = HANDLERS[job.kind as JobKind];
  try {
    if (!handler) throw new JobError("unknown_job_kind", `No handler for ${job.kind}`, true);
    const result = (await handler(job)) ?? {};
    await finish(job, result);
    if (result.afterSuccess) {
      try {
        await result.afterSuccess();
      } catch (error) {
        logger.error("job follow-up failed", { jobId: job.id, kind: job.kind, error });
      }
    }
  } catch (error) {
    await fail(job, error);
  }
}

export interface RunOptions {
  attemptId?: string;
  limit?: number;
  budgetMs?: number;
}

/**
 * Runs due jobs until none are left, the limit is hit or the time budget is spent.
 * Follow-up jobs created by handlers (e.g. score -> report -> deliver) are picked up
 * in the same call, so the happy path completes in one pass.
 */
export async function runDueJobs(options: RunOptions = {}): Promise<{ ran: number }> {
  const db = getDb();
  const limit = options.limit ?? 25;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let ran = 0;
  const skipped = new Set<string>();
  while (ran < limit && Date.now() < deadline) {
    const now = new Date();
    const candidates = await db.job.findMany({
      where: {
        ...(options.attemptId ? { attemptId: options.attemptId } : {}),
        id: { notIn: [...skipped] },
        OR: [
          { status: { in: ["pending", "failed"] }, runAt: { lte: now } },
          { status: "running", lockedUntil: { lt: now } },
        ],
      },
      orderBy: { runAt: "asc" },
      take: 5,
      select: { id: true },
    });
    if (candidates.length === 0) break;
    for (const { id } of candidates) {
      if (ran >= limit || Date.now() >= deadline) break;
      const job = await claim(id);
      if (!job) {
        skipped.add(id);
        continue;
      }
      await runJob(job);
      ran += 1;
    }
  }
  return { ran };
}

/** Whether an attempt has work that is due now (used by status polling). */
export async function hasDueJobs(attemptId: string): Promise<boolean> {
  const now = new Date();
  const count = await getDb().job.count({
    where: {
      attemptId,
      OR: [
        { status: { in: ["pending", "failed"] }, runAt: { lte: now } },
        { status: "running", lockedUntil: { lt: now } },
      ],
    },
  });
  return count > 0;
}

/**
 * Runs due jobs after the HTTP response is sent (Vercel keeps the function alive via
 * waitUntil; Node servers run it in-process). Falls back to fire-and-forget outside a request.
 */
export function scheduleJobRun(options: RunOptions = {}): void {
  const task = () =>
    runDueJobs(options).catch((error) => {
      logger.error("background job run failed", { error });
    });
  try {
    after(task);
  } catch {
    void task();
  }
}

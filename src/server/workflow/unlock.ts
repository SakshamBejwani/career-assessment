import "server-only";
import { getConfig } from "../config";
import { getDb, type Tx } from "../db";
import { recordAudit } from "./audit";
import { emitOwnerEvent, enqueueJobs, type NewJob } from "./queue";

/**
 * THE unlock rule (spec §5.4). A report may be released only when a payment row for the
 * attempt is `succeeded`, was verified server-side, and matches the attempt's price snapshot.
 * Every report access path calls this; nothing else decides unlock.
 */
export async function hasVerifiedPayment(attemptId: string, tx?: Tx): Promise<boolean> {
  const db = tx ?? getDb();
  const attempt = await db.attempt.findUnique({ where: { id: attemptId }, select: { priceAmount: true, currency: true } });
  if (!attempt) return false;
  const paid = await db.payment.findFirst({
    where: {
      attemptId,
      status: "succeeded",
      verifiedAt: { not: null },
      amount: attempt.priceAmount,
      currency: attempt.currency,
    },
    select: { id: true },
  });
  return Boolean(paid);
}

/** Student-facing delivery jobs for a report (email and/or WhatsApp per consent and config). */
export function deliveryJobsFor(
  attempt: { id: string; deliverEmail: boolean; deliverWhatsapp: boolean; contactWhatsapp: string | null },
  reportId: string,
  purpose: string,
): NewJob[] {
  const { email, whatsapp } = getConfig();
  const jobs: NewJob[] = [];
  if (attempt.deliverEmail && email.provider !== "none") {
    jobs.push({ kind: "deliver_email", channel: "email", attemptId: attempt.id, reportId, purpose, dedupeKey: `deliver:${reportId}:email:${purpose}` });
  }
  if (attempt.deliverWhatsapp && attempt.contactWhatsapp && whatsapp.provider !== "none") {
    jobs.push({
      kind: "deliver_whatsapp",
      channel: "whatsapp",
      attemptId: attempt.id,
      reportId,
      purpose,
      dedupeKey: `deliver:${reportId}:whatsapp:${purpose}`,
    });
  }
  return jobs;
}

/**
 * Moves report_ready_locked -> report_unlocked if (and only if) a verified payment exists,
 * then queues delivery. Safe to call from the payment path and the report path concurrently:
 * the guarded update lets exactly one caller win, and job dedupe keys absorb any overlap.
 */
export async function tryUnlock(attemptId: string, correlationId?: string): Promise<boolean> {
  const db = getDb();
  if (!(await hasVerifiedPayment(attemptId))) return false;
  const report = await db.report.findFirst({ where: { attemptId, status: "ready" }, orderBy: { createdAt: "desc" } });
  if (!report) return false;

  return db.$transaction(async (tx) => {
    const { count } = await tx.attempt.updateMany({
      where: { id: attemptId, status: "report_ready_locked", paidAt: { not: null } },
      data: { status: "report_unlocked" },
    });
    if (count !== 1) return false;
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    const jobs = deliveryJobsFor(attempt, report.id, "initial");
    await enqueueJobs(jobs, tx);
    await recordAudit({ actorType: "system", eventType: "report.unlocked", entityType: "attempt", entityId: attemptId, correlationId }, tx);
    if (jobs.length === 0) {
      await tx.attempt.updateMany({ where: { id: attemptId, status: "report_unlocked" }, data: { status: "completed", completedAt: new Date() } });
    }
    return true;
  });
}

/** report_unlocked -> completed once every initial student delivery has been sent. */
export async function tryComplete(attemptId: string): Promise<boolean> {
  const db = getDb();
  const pending = await db.job.count({
    where: { attemptId, kind: { in: ["deliver_email", "deliver_whatsapp"] }, purpose: "initial", status: { not: "succeeded" } },
  });
  if (pending > 0) return false;
  const { count } = await db.attempt.updateMany({
    where: { id: attemptId, status: "report_unlocked" },
    data: { status: "completed", completedAt: new Date() },
  });
  if (count === 1) await emitOwnerEvent("report_delivered", { attemptId });
  return count === 1;
}

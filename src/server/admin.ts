import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isAssessmentId } from "@/lib/assessment-ids";
import { ATTEMPT_STATUSES, type AttemptStatus } from "@/lib/status";
import { getDb } from "./db";
import { AppError, Errors } from "./errors";
import { recordAudit } from "./workflow/audit";
import { enqueueJobs } from "./workflow/queue";
import { deliveryJobsFor, hasVerifiedPayment } from "./workflow/unlock";

export interface AttemptFilters {
  status?: string;
  assessmentId?: string;
  q?: string;
  attention?: boolean;
  page?: number;
}

const PAGE_SIZE = 25;

function attentionWhere(): Prisma.AttemptWhereInput {
  return { OR: [{ status: "failed" }, { jobs: { some: { status: "dead" } } }] };
}

export async function listAttempts(filters: AttemptFilters) {
  const db = getDb();
  const where: Prisma.AttemptWhereInput = {};
  if (filters.status && (ATTEMPT_STATUSES as readonly string[]).includes(filters.status)) where.status = filters.status as AttemptStatus;
  if (filters.assessmentId && isAssessmentId(filters.assessmentId)) where.assessmentId = filters.assessmentId;
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    // Emails are stored lower-cased, so plain `contains` behaves the same on PostgreSQL and MySQL.
    where.OR = [{ contactEmail: { contains: q } }, { publicRef: { contains: q.toUpperCase() } }];
  }
  if (filters.attention) Object.assign(where, attentionWhere());
  const page = Math.max(1, filters.page ?? 1);
  const [total, rows] = await Promise.all([
    db.attempt.count({ where }),
    db.attempt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        publicRef: true,
        assessmentId: true,
        status: true,
        paymentWorkflow: true,
        priceAmount: true,
        currency: true,
        paidAt: true,
        contactEmail: true,
        approvalState: true,
        createdAt: true,
        submittedAt: true,
        jobs: { where: { status: "dead" }, select: { id: true } },
      },
    }),
  ]);
  return { total, page, pageSize: PAGE_SIZE, rows: rows.map(({ jobs, ...r }) => ({ ...r, deadJobs: jobs.length })) };
}

export async function attentionCount(): Promise<number> {
  return getDb().attempt.count({ where: attentionWhere() });
}

export async function attemptDetail(id: string, admin: string, correlationId: string) {
  const db = getDb();
  const attempt = await db.attempt.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, createdAt: true } },
      consents: { orderBy: { grantedAt: "asc" } },
      result: true,
      payments: { orderBy: { createdAt: "asc" } },
      reports: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, templateVersion: true, interpretationVersion: true, checksum: true, byteSize: true, storageDriver: true, generatedAt: true, errorCode: true, createdAt: true } },
      jobs: { orderBy: { createdAt: "asc" } },
      _count: { select: { responses: true } },
    },
  });
  if (!attempt) throw Errors.notFound("Attempt");
  const audit = await db.auditEvent.findMany({
    where: {
      OR: [
        { entityType: "attempt", entityId: id },
        { entityType: "payment", entityId: { in: attempt.payments.map((p) => p.id) } },
        { entityType: "report", entityId: { in: attempt.reports.map((r) => r.id) } },
        { entityType: "job", entityId: { in: attempt.jobs.map((j) => j.id) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  await recordAudit({ actorType: "admin", actorId: admin, eventType: "admin.attempt_viewed", entityType: "attempt", entityId: id, correlationId });
  const { draftAnswers: _draft, accessTokenHash: _hash, ...safe } = attempt;
  return { attempt: safe, audit };
}

export async function retryJob(jobId: string, admin: string, correlationId: string) {
  const db = getDb();
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw Errors.notFound("Job");
  if (job.status !== "dead" && job.status !== "failed") throw new AppError("not_retryable", "Only failed jobs can be retried.", 409);
  await db.$transaction(async (tx) => {
    if (job.attemptId && (job.kind === "score_attempt" || job.kind === "generate_report")) {
      // Re-open the attempt so the handler's state guards accept it again.
      await tx.attempt.updateMany({
        where: { id: job.attemptId, status: "failed" },
        data: { status: job.kind === "score_attempt" ? "submitted" : "scored", failedAt: null, failureCode: null },
      });
      if (job.kind === "generate_report") {
        await tx.report.updateMany({ where: { attemptId: job.attemptId, status: "failed" }, data: { status: "generating", errorCode: null } });
      }
    }
    await tx.job.update({ where: { id: jobId }, data: { status: "pending", attempts: 0, runAt: new Date(), lockedUntil: null } });
    await recordAudit({ actorType: "admin", actorId: admin, eventType: "admin.job_retried", entityType: "job", entityId: jobId, correlationId, metadata: { kind: job.kind } }, tx);
  });
  return { attemptId: job.attemptId };
}

export async function resendReport(attemptId: string, admin: string, correlationId: string) {
  const db = getDb();
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw Errors.notFound("Attempt");
  const report = await db.report.findFirst({ where: { attemptId, status: "ready" }, orderBy: { createdAt: "desc" } });
  if (!report || !(await hasVerifiedPayment(attemptId))) throw new AppError("report_locked", "There's no unlocked report to send.", 409);
  const previous = await db.job.count({ where: { attemptId, purpose: { startsWith: "resend-" } } });
  const jobs = deliveryJobsFor(attempt, report.id, `resend-${Math.floor(previous / 2) + 1}-${Date.now()}`);
  if (jobs.length === 0) throw new AppError("no_channel", "No delivery channel is enabled for this attempt.", 409);
  await enqueueJobs(jobs);
  await recordAudit({ actorType: "admin", actorId: admin, eventType: "admin.report_resent", entityType: "attempt", entityId: attemptId, correlationId, metadata: { channels: jobs.map((j) => j.channel ?? "") } });
  return { queued: jobs.length };
}

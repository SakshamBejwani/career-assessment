import "server-only";
import type { Job, Prisma } from "@/generated/prisma/client";
import type { AssessmentId } from "@/lib/assessment-ids";
import { firstName } from "@/lib/format";
import type { AnswerMap } from "@/lib/questionnaire-types";
import type { JobKind } from "@/lib/status";
import { getDefinition, getVersion } from "../../assessments/registry";
import { ScoringError } from "../../assessments/types";
import { canonicalAnswers } from "../../assessments/validate";
import { getConfig, type OwnerEvent } from "../../config";
import { getDb } from "../../db";
import { DeliveryError, sendEmail } from "../../delivery/email";
import { ownerNotificationEmail, reportReadyEmail } from "../../delivery/messages";
import { sendReportWhatsapp } from "../../delivery/whatsapp";
import { logger } from "../../observability/logger";
import { buildReportData } from "../../reports/data";
import { renderReport } from "../../reports/render";
import { getReport, putReport, type StoredObject } from "../../reports/storage";
import { sha256Hex } from "../../security/crypto";
import { reportLinkUrl } from "../../security/report-links";
import { recordAudit } from "../audit";
import { emitOwnerEvent, enqueueJobs } from "../queue";
import { transitionAttempt } from "../transitions";
import { JobError as HandlerError } from "../job-error";
import { hasVerifiedPayment, tryComplete, tryUnlock } from "../unlock";

export interface JobHandlerResult {
  providerMessageId?: string | null;
  /** Runs after the job row is marked succeeded (so it sees its own job as done). */
  afterSuccess?: () => Promise<unknown>;
}

type Handler = (job: Job) => Promise<JobHandlerResult | void>;


const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function requireAttemptId(job: Job): string {
  if (!job.attemptId) throw new HandlerError("missing_attempt", "Job has no attempt", true);
  return job.attemptId;
}

// ── score_attempt ───────────────────────────────────────────────────────────
async function scoreAttempt(job: Job) {
  const db = getDb();
  const attemptId = requireAttemptId(job);
  const attempt = await db.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { responses: true, result: true } });

  if (!attempt.result) {
    if (!(await transitionAttempt(attemptId, ["submitted", "scoring"], "scoring"))) {
      throw new HandlerError("unexpected_state", `Attempt is ${attempt.status}, expected submitted`, true);
    }
    const version = getVersion(attempt.assessmentId as AssessmentId, attempt.assessmentVersion);
    const responses: AnswerMap = Object.fromEntries(attempt.responses.map((r) => [r.questionId, r.answer as AnswerMap[string]]));
    const checksum = sha256Hex(JSON.stringify(canonicalAnswers(version.questionnaire, responses)));
    if (checksum !== attempt.responsesChecksum) throw new HandlerError("checksum_mismatch", "Frozen responses changed after submission", true);

    let output;
    try {
      output = version.scorer.score({ questionnaire: version.questionnaire, responses });
    } catch (error) {
      if (error instanceof ScoringError) throw new HandlerError(`scoring_${error.code}`, error.message, true);
      throw error;
    }
    if (output.scoringVersion !== attempt.scoringVersion) {
      throw new HandlerError("scoring_version_mismatch", "Scorer version differs from the attempt snapshot", true);
    }

    await db.$transaction(async (tx) => {
      await tx.result.create({
        data: {
          attemptId,
          assessmentId: attempt.assessmentId,
          scoringVersion: output.scoringVersion,
          scores: output.scores as unknown as Prisma.InputJsonValue,
          warnings: output.warnings,
          responsesChecksum: checksum,
          scoredAt: new Date(),
        },
      });
      await transitionAttempt(attemptId, ["scoring"], "scored", {}, tx);
      await recordAudit({ actorType: "system", eventType: "attempt.scored", entityType: "attempt", entityId: attemptId }, tx);
      await emitOwnerEvent("scoring_completed", { attemptId }, tx);
    });
    logger.metric("scoring_succeeded", { assessmentId: attempt.assessmentId });
  }

  await enqueueJobs([
    {
      kind: "generate_report",
      attemptId,
      dedupeKey: `report:${attemptId}:${attempt.reportTemplateVersion}`,
    },
  ]);
}

// ── generate_report ─────────────────────────────────────────────────────────
async function generateReport(job: Job) {
  const db = getDb();
  const attemptId = requireAttemptId(job);
  const attempt = await db.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { result: true } });
  if (!attempt.result) throw new HandlerError("no_result", "Attempt has no result to report on", true);
  const result = attempt.result;

  const existing = await db.report.findUnique({
    where: { attemptId_resultId_templateVersion: { attemptId, resultId: result.id, templateVersion: attempt.reportTemplateVersion } },
  });

  if (existing?.status !== "ready") {
    await transitionAttempt(attemptId, ["scored", "report_generating"], "report_generating");
    const report =
      existing ??
      (await db.report.create({
        data: {
          attemptId,
          resultId: result.id,
          templateVersion: attempt.reportTemplateVersion,
          interpretationVersion: attempt.interpretationVersion,
          status: "generating",
        },
      }));
    const { pdf, checksum } = await renderReport(buildReportData(attempt, result));
    const stored = await putReport(report.id, pdf);
    await db.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: "ready",
          storageDriver: stored.driver,
          storageKey: stored.key,
          checksum,
          byteSize: pdf.length,
          generatedAt: new Date(),
          errorCode: null,
        },
      });
      await transitionAttempt(attemptId, ["report_generating"], "report_ready_locked", {}, tx);
      await recordAudit(
        { actorType: "system", eventType: "report.generated", entityType: "report", entityId: report.id, metadata: { checksum, bytes: pdf.length } },
        tx,
      );
      await emitOwnerEvent("report_generated", { attemptId, entityId: report.id }, tx);
    });
    logger.metric("report_generated", { assessmentId: attempt.assessmentId, bytes: pdf.length });
  }

  // Unlocks immediately if payment already arrived (upfront flow, or paid while generating).
  await tryUnlock(attemptId);
}

// ── deliveries ──────────────────────────────────────────────────────────────
async function loadDeliveryContext(job: Job) {
  const db = getDb();
  const attemptId = requireAttemptId(job);
  if (!job.reportId) throw new HandlerError("missing_report", "Delivery job has no report", true);
  const report = await db.report.findUniqueOrThrow({ where: { id: job.reportId } });
  const attempt = await db.attempt.findUniqueOrThrow({ where: { id: attemptId } });
  // Defence in depth: never send an unpaid report, whatever queued the job.
  if (report.status !== "ready" || !(await hasVerifiedPayment(attemptId))) {
    throw new HandlerError("not_unlocked", "Report is not unlocked", true);
  }
  return { attempt, report };
}

async function deliverEmail(job: Job): Promise<JobHandlerResult> {
  const { attempt, report } = await loadDeliveryContext(job);
  const config = getConfig();
  const def = getDefinition(attempt.assessmentId as AssessmentId);
  let attachment: Buffer | undefined;
  if (config.email.attachPdf && (report.byteSize ?? 0) <= MAX_ATTACHMENT_BYTES && report.storageDriver && report.storageKey) {
    attachment = await getReport(report.id, { driver: report.storageDriver as StoredObject["driver"], key: report.storageKey });
  }
  const message = reportReadyEmail({
    orgName: config.orgName,
    studentName: attempt.contactName,
    assessmentName: def.shortName.toLowerCase(),
    reference: attempt.publicRef,
    link: reportLinkUrl(report.id),
    linkTtlHours: config.reportLinkTtlHours,
    attached: Boolean(attachment),
    supportEmail: config.supportEmail,
  });
  try {
    const { messageId } = await sendEmail({
      to: attempt.contactEmail,
      ...message,
      attachments: attachment ? [{ filename: `report-${attempt.publicRef}.pdf`, content: attachment, contentType: "application/pdf" }] : undefined,
    });
    await recordAudit({ actorType: "system", eventType: "delivery.email.sent", entityType: "job", entityId: job.id });
    logger.metric("delivery_succeeded", { channel: "email" });
    return { providerMessageId: messageId, afterSuccess: () => tryComplete(attempt.id) };
  } catch (error) {
    if (error instanceof DeliveryError) throw new HandlerError(error.code, error.message, error.permanent);
    throw error;
  }
}

async function deliverWhatsapp(job: Job): Promise<JobHandlerResult> {
  const { attempt, report } = await loadDeliveryContext(job);
  if (!attempt.contactWhatsapp || !attempt.deliverWhatsapp) throw new HandlerError("no_whatsapp_consent", "No WhatsApp number or opt-in", true);
  try {
    const { messageId } = await sendReportWhatsapp({
      toE164: attempt.contactWhatsapp,
      firstName: firstName(attempt.contactName),
      link: reportLinkUrl(report.id),
    });
    await recordAudit({ actorType: "system", eventType: "delivery.whatsapp.sent", entityType: "job", entityId: job.id });
    logger.metric("delivery_succeeded", { channel: "whatsapp" });
    return { providerMessageId: messageId, afterSuccess: () => tryComplete(attempt.id) };
  } catch (error) {
    if (error instanceof DeliveryError) throw new HandlerError(error.code, error.message, error.permanent);
    throw error;
  }
}

// ── notify_owner ────────────────────────────────────────────────────────────
async function notifyOwner(job: Job): Promise<JobHandlerResult> {
  const config = getConfig();
  if (config.owner.emails.length === 0) return {};
  const event = ((job.payload as { event?: OwnerEvent } | null)?.event ?? job.purpose) as OwnerEvent;
  const attempt = job.attemptId ? await getDb().attempt.findUnique({ where: { id: job.attemptId } }) : null;
  const message = ownerNotificationEmail({
    orgName: config.orgName,
    event,
    reference: attempt?.publicRef ?? "n/a",
    assessmentName: attempt ? getDefinition(attempt.assessmentId as AssessmentId).shortName : "n/a",
    occurredAt: job.createdAt,
    timezone: config.displayTimezone,
    adminUrl: `${config.appUrl}/admin${attempt ? `/attempts/${attempt.id}` : ""}`,
  });
  try {
    const { messageId } = await sendEmail({ to: config.owner.emails, ...message });
    return { providerMessageId: messageId };
  } catch (error) {
    if (error instanceof DeliveryError) throw new HandlerError(error.code, error.message, error.permanent);
    throw error;
  }
}

export const HANDLERS: Record<JobKind, Handler> = {
  score_attempt: scoreAttempt,
  generate_report: generateReport,
  deliver_email: deliverEmail,
  deliver_whatsapp: deliverWhatsapp,
  notify_owner: notifyOwner,
};

/** Runs once when a job exhausts its retries (or fails permanently). */
export async function onJobDead(job: Job, code: string): Promise<void> {
  const attemptId = job.attemptId;
  if (!attemptId) return;
  const db = getDb();
  switch (job.kind as JobKind) {
    case "score_attempt":
      await transitionAttempt(attemptId, ["submitted", "scoring"], "failed", { failedAt: new Date(), failureCode: code });
      await recordAudit({ actorType: "system", eventType: "attempt.scoring_failed", entityType: "attempt", entityId: attemptId, metadata: { code } });
      await emitOwnerEvent("scoring_failed", { attemptId, entityId: job.id });
      logger.metric("scoring_failed", { code });
      break;
    case "generate_report":
      await db.report.updateMany({ where: { attemptId, status: { not: "ready" } }, data: { status: "failed", errorCode: code } });
      await transitionAttempt(attemptId, ["scored", "report_generating"], "failed", { failedAt: new Date(), failureCode: code });
      await recordAudit({ actorType: "system", eventType: "report.generation_failed", entityType: "attempt", entityId: attemptId, metadata: { code } });
      await emitOwnerEvent("report_generation_failed", { attemptId, entityId: job.id });
      logger.metric("report_failed", { code });
      break;
    case "deliver_email":
    case "deliver_whatsapp":
      await recordAudit({ actorType: "system", eventType: "delivery.failed", entityType: "job", entityId: job.id, metadata: { code, channel: job.channel } });
      await emitOwnerEvent("report_delivery_failed", { attemptId, entityId: job.id });
      logger.metric("delivery_failed", { channel: job.channel, code });
      break;
    case "notify_owner":
      break;
  }
}

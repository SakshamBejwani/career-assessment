import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import type { Attempt } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { isAssessmentId, type AssessmentId } from "@/lib/assessment-ids";
import { CONSENT_TEXT_VERSION, type ConsentPurpose } from "@/lib/consent";
import type { AnswerMap } from "@/lib/questionnaire-types";
import type { AttemptView } from "@/lib/attempt-view";
import { ATTEMPT_STATUS_LABEL, POST_SUBMIT_PAYABLE, type AttemptStatus } from "@/lib/status";
import { availability, getActiveVersion, getDefinition, getVersion, isFullyApproved } from "../assessments/registry";
import { canonicalAnswers, validateAnswers, withCheckboxDefaults } from "../assessments/validate";
import { getConfig } from "../config";
import { getDb, isUniqueViolation } from "../db";
import { AppError, Errors } from "../errors";
import { logger } from "../observability/logger";
import { issueAttemptToken, readAttemptToken, tokenMatches } from "../security/attempt-access";
import { publicReference, sha256Hex } from "../security/crypto";
import { recordAudit } from "./audit";
import { emitOwnerEvent, enqueueJobs } from "./queue";
import { transitionAttempt } from "./transitions";

// ── Input schemas (shared by route handlers) ────────────────────────────────

export const createAttemptSchema = z.object({
  assessmentId: z.string().refine(isAssessmentId, "Unknown assessment"),
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email address").max(254),
  whatsapp: z.string().trim().max(32).optional().or(z.literal("")),
  consents: z.object({
    dataProcessing: z.literal(true, { error: "This agreement is required to continue" }),
    ageOrGuardian: z.literal(true, { error: "This confirmation is required to continue" }),
    whatsapp: z.boolean().default(false),
  }),
});
export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;

const answerValue = z.union([z.string().max(8), z.array(z.string().max(8)).max(8), z.boolean()]);
export const answersSchema = z.record(z.string().max(40), answerValue).refine((a) => Object.keys(a).length <= 200, "Too many answers");
export const saveAnswersSchema = z.object({ answers: answersSchema });
export const submitSchema = z.object({ answers: answersSchema.default({}), submissionKey: z.string().min(8).max(64) });

// ── Helpers ─────────────────────────────────────────────────────────────────

export function normaliseWhatsapp(raw: string | undefined, region: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const parsed = parsePhoneNumberFromString(raw, region as Parameters<typeof parsePhoneNumberFromString>[1]);
  if (!parsed || !parsed.isValid()) throw Errors.invalid("Enter a valid WhatsApp number, including the country code if outside India.", { fields: [{ path: "whatsapp", message: "Invalid number" }] });
  return parsed.number; // E.164
}

/** Loads an attempt the caller is allowed to see (cookie token). Missing and forbidden look identical. */
export async function getAuthorisedAttempt(attemptId: string): Promise<Attempt> {
  if (!/^[a-z0-9]{20,30}$/.test(attemptId)) throw Errors.notFound("Assessment");
  const attempt = await getDb().attempt.findUnique({ where: { id: attemptId } });
  const token = await readAttemptToken(attemptId);
  if (!attempt || !tokenMatches(token, attempt.accessTokenHash)) throw Errors.notFound("Assessment");
  return attempt;
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createAttempt(input: CreateAttemptInput, correlationId: string): Promise<{ attempt: Attempt; token: string }> {
  const config = getConfig();
  const assessmentId = input.assessmentId as AssessmentId;
  const avail = availability(assessmentId);
  if (!avail.available) throw new AppError("assessment_unavailable", "This assessment isn't available right now.", 409);

  const def = getDefinition(assessmentId);
  const version = getActiveVersion(assessmentId);
  const email = input.email.trim().toLowerCase();
  const whatsapp = normaliseWhatsapp(input.whatsapp, config.whatsapp.defaultRegion);
  const workflow = config.assessments.workflows[assessmentId];
  const price = config.assessments.prices[assessmentId]!;
  const { token, hash } = issueAttemptToken();
  const now = new Date();

  for (let tries = 0; tries < 3; tries++) {
    try {
      const attempt = await getDb().$transaction(async (tx) => {
        const student =
          (await tx.student.findUnique({ where: { email } })) ??
          (await tx.student.create({ data: { email, fullName: input.fullName.trim(), whatsappE164: whatsapp } }));
        const created = await tx.attempt.create({
          data: {
            publicRef: publicReference(),
            studentId: student.id,
            assessmentId,
            assessmentVersion: version.version,
            questionnaireVersion: version.questionnaire.questionnaireVersion,
            scoringVersion: version.scorer.scoringVersion,
            reportTemplateVersion: version.reportTemplateVersion,
            interpretationVersion: version.interpretation.version,
            approvalState: isFullyApproved(version) ? "approved" : "preview",
            status: workflow === "upfront" ? "awaiting_payment" : "in_progress",
            paymentWorkflow: workflow,
            priceAmount: price,
            currency: config.payments.currency,
            accessTokenHash: hash,
            contactName: input.fullName.trim(),
            contactEmail: email,
            contactWhatsapp: whatsapp,
            deliverEmail: true,
            deliverWhatsapp: Boolean(whatsapp && input.consents.whatsapp),
            startedAt: workflow === "upfront" ? null : now,
          },
        });
        const consentRows: { purpose: ConsentPurpose; granted: boolean }[] = [
          { purpose: "data_processing", granted: true },
          { purpose: "age_or_guardian", granted: true },
          { purpose: "email_delivery", granted: true },
          { purpose: "whatsapp_delivery", granted: Boolean(whatsapp && input.consents.whatsapp) },
        ];
        await tx.consent.createMany({
          data: consentRows.map((c) => ({ ...c, studentId: student.id, attemptId: created.id, textVersion: CONSENT_TEXT_VERSION, grantedAt: now })),
        });
        await recordAudit(
          { actorType: "student", eventType: "attempt.created", entityType: "attempt", entityId: created.id, correlationId, metadata: { assessmentId, workflow } },
          tx,
        );
        await emitOwnerEvent("assessment_started", { attemptId: created.id }, tx);
        return created;
      });
      logger.metric("attempt_started", { assessmentId, workflow, preview: avail.preview, name: def.id });
      return { attempt, token };
    } catch (error) {
      // Extremely unlikely public reference collision: retry with a new one.
      if (isUniqueViolation(error) && tries < 2) continue;
      throw error;
    }
  }
  throw new Error("unreachable");
}

// ── Autosave ────────────────────────────────────────────────────────────────

export async function saveDraftAnswers(attempt: Attempt, answers: AnswerMap): Promise<{ saved: number }> {
  if (attempt.status !== "in_progress") {
    throw Errors.conflict("not_editable", attempt.status === "awaiting_payment" ? "Complete payment to start this assessment." : "These answers have already been submitted.");
  }
  const version = getVersion(attempt.assessmentId as AssessmentId, attempt.assessmentVersion);
  const issues = validateAnswers(version.questionnaire, answers, "partial");
  if (issues.length) throw Errors.invalid("Some answers are not valid for this questionnaire.", { issues });
  const merged = { ...((attempt.draftAnswers as AnswerMap | null) ?? {}), ...answers };
  const { count } = await getDb().attempt.updateMany({
    where: { id: attempt.id, status: "in_progress" },
    data: { draftAnswers: merged },
  });
  if (count !== 1) throw Errors.conflict("not_editable", "These answers have already been submitted.");
  return { saved: Object.keys(answers).length };
}

// ── Submit ──────────────────────────────────────────────────────────────────

export async function submitAttempt(
  attempt: Attempt,
  input: { answers: AnswerMap; submissionKey: string },
  correlationId: string,
): Promise<Attempt> {
  // Idempotent replay of the same submission (refresh, network retry).
  if (attempt.submissionKey && attempt.submissionKey === input.submissionKey) return attempt;
  if (attempt.status === "awaiting_payment") throw Errors.conflict("payment_required", "Complete payment to start this assessment.");
  if (attempt.status !== "in_progress") throw Errors.conflict("already_submitted", "These answers have already been submitted.");

  const version = getVersion(attempt.assessmentId as AssessmentId, attempt.assessmentVersion);
  const merged = withCheckboxDefaults(version.questionnaire, { ...((attempt.draftAnswers as AnswerMap | null) ?? {}), ...input.answers });
  const issues = validateAnswers(version.questionnaire, merged, "complete");
  if (issues.length) {
    throw Errors.invalid(
      issues.some((i) => i.problem !== "missing") ? "Some answers are not valid for this questionnaire." : "Answer every question before submitting.",
      { issues },
    );
  }
  const canonical = canonicalAnswers(version.questionnaire, merged);
  const checksum = sha256Hex(JSON.stringify(canonical));
  const now = new Date();

  try {
    await getDb().$transaction(async (tx) => {
      const moved = await transitionAttempt(
        attempt.id,
        ["in_progress"],
        "submitted",
        { submittedAt: now, submissionKey: input.submissionKey, responsesChecksum: checksum, draftAnswers: Prisma.DbNull },
        tx,
      );
      if (!moved) throw Errors.conflict("already_submitted", "These answers have already been submitted.");
      await tx.response.createMany({
        data: Object.entries(canonical).map(([questionId, answer]) => ({ attemptId: attempt.id, questionId, answer, answeredAt: now })),
      });
      await enqueueJobs([{ kind: "score_attempt", attemptId: attempt.id, dedupeKey: `score:${attempt.id}` }], tx);
      await recordAudit(
        { actorType: "student", eventType: "attempt.submitted", entityType: "attempt", entityId: attempt.id, correlationId, metadata: { items: Object.keys(canonical).length } },
        tx,
      );
      await emitOwnerEvent("assessment_submitted", { attemptId: attempt.id }, tx);
    });
  } catch (error) {
    // A concurrent identical submission won the race: treat as the same submission.
    if (isUniqueViolation(error) || (error instanceof AppError && error.code === "already_submitted")) {
      const current = await getDb().attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      if (current.submissionKey === input.submissionKey) return current;
    }
    throw error;
  }
  logger.metric("attempt_submitted", { assessmentId: attempt.assessmentId });
  return getDb().attempt.findUniqueOrThrow({ where: { id: attempt.id } });
}

// ── Student-facing status ───────────────────────────────────────────────────

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}${"•".repeat(Math.max(0, phone.length - 6))}${phone.slice(-3)}`;
}


export async function attemptView(attempt: Attempt): Promise<AttemptView> {
  const db = getDb();
  const id = attempt.assessmentId as AssessmentId;
  const def = getDefinition(id);
  const version = getVersion(id, attempt.assessmentVersion);
  const [report, jobs] = await Promise.all([
    db.report.findFirst({ where: { attemptId: attempt.id, status: "ready" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    db.job.findMany({
      where: { attemptId: attempt.id, kind: { in: ["deliver_email", "deliver_whatsapp"] } },
      orderBy: { createdAt: "asc" },
      select: { channel: true, status: true, purpose: true },
    }),
  ]);
  const status = attempt.status as AttemptStatus;
  const paid = Boolean(attempt.paidAt);
  const unlocked = status === "report_unlocked" || status === "completed";
  const payable =
    !paid && (attempt.paymentWorkflow === "upfront" ? status === "awaiting_payment" : POST_SUBMIT_PAYABLE.includes(status));
  return {
    id: attempt.id,
    reference: attempt.publicRef,
    assessment: { id, name: def.name, shortName: def.shortName },
    status,
    statusLabel: ATTEMPT_STATUS_LABEL[status],
    paymentWorkflow: attempt.paymentWorkflow as AttemptView["paymentWorkflow"],
    price: attempt.priceAmount,
    currency: attempt.currency,
    paid,
    payable,
    preview: attempt.approvalState !== "approved",
    allowBackNavigation: version.allowBackNavigation,
    answers: status === "in_progress" ? ((attempt.draftAnswers as AnswerMap | null) ?? {}) : null,
    report: report ? { id: report.id, ready: true, unlocked } : null,
    deliveries: jobs.map((j) => ({ channel: j.channel ?? "", status: j.status, purpose: j.purpose })),
    contact: {
      email: maskEmail(attempt.contactEmail),
      whatsapp: attempt.contactWhatsapp ? maskPhone(attempt.contactWhatsapp) : null,
      whatsappOptIn: attempt.deliverWhatsapp,
    },
    failed: status === "failed",
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    paymentProvider: getConfig().payments.provider,
  };
}

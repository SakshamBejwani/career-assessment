import { afterAll, beforeEach, describe, expect, it } from "vitest";
import mbtiQ from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import type { AnswerMap } from "@/lib/questionnaire-types";
import { resendReport, retryJob } from "@/server/admin";
import { resetConfigForTests } from "@/server/config";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { setPaymentProviderForTests } from "@/server/payments";
import { createRazorpayProvider } from "@/server/payments/providers/razorpay";
import { buildReportData } from "@/server/reports/data";
import { renderReport } from "@/server/reports/render";
import { hmacHex } from "@/server/security/crypto";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { signReportToken } from "@/server/security/report-links";
import { createAttempt, saveDraftAnswers, submitAttempt, type CreateAttemptInput } from "@/server/workflow/attempts";
import { createPaymentSession, processPaymentWebhook, simulateMockPayment } from "@/server/workflow/payments";
import { authoriseReport, readReportPdf } from "@/server/workflow/report-access";
import { runDueJobs } from "@/server/workflow/runner";
import { setTestEnv } from "../support/env";

const db = getDb();

const mbtiAnswers = (v = "b"): AnswerMap => Object.fromEntries(mbtiQ.items.map((i) => [i.id, v]));
const varkAnswers = (): AnswerMap => Object.fromEntries(varkQ.items.map((i) => [i.id, ["a"]]));

function input(assessmentId: CreateAttemptInput["assessmentId"], extra: Partial<CreateAttemptInput> = {}): CreateAttemptInput {
  return {
    assessmentId,
    fullName: "Asha Test",
    email: `asha.${Math.random().toString(36).slice(2)}@example.test`,
    whatsapp: "98765 43210",
    consents: { dataProcessing: true, ageOrGuardian: true, whatsapp: true },
    ...extra,
  };
}

const status = async (id: string) => (await db.attempt.findUniqueOrThrow({ where: { id } })).status;

async function reset(env: Record<string, string> = {}) {
  setTestEnv({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_PROVIDER: process.env.TEST_DATABASE_PROVIDER ?? "postgresql",
    OWNER_NOTIFY_EMAILS: "owner@example.test",
    ...env,
  });
  resetConfigForTests();
  setPaymentProviderForTests(undefined);
}

beforeEach(async () => {
  await reset();
  await db.auditEvent.deleteMany();
  await db.paymentEvent.deleteMany();
  await db.rateLimit.deleteMany();
  await db.student.deleteMany(); // cascades to attempts and everything below
});

afterAll(async () => {
  await db.$disconnect();
});

describe("post-completion journey", () => {
  it("scores, generates a locked report, unlocks on payment and delivers once", async () => {
    const { attempt } = await createAttempt(input("mbti_personality"), "t1");
    expect(attempt.status).toBe("in_progress");
    expect(attempt.contactWhatsapp).toBe("+919876543210");

    await saveDraftAnswers(attempt, { mbti_q001: "a" });
    const fresh = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const submitted = await submitAttempt(fresh, { answers: mbtiAnswers("b"), submissionKey: "submit-key-1" }, "t2");
    expect(submitted.status).toBe("submitted");
    expect(await db.response.count({ where: { attemptId: attempt.id } })).toBe(70);

    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("report_ready_locked");
    const result = await db.result.findUniqueOrThrow({ where: { attemptId: attempt.id } });
    expect((result.scores as { typeCode: string }).typeCode).toBe("INFP");
    const report = await db.report.findFirstOrThrow({ where: { attemptId: attempt.id } });
    expect(report.status).toBe("ready");
    expect(report.checksum).toMatch(/^[0-9a-f]{64}$/);

    // Locked: a valid link is not enough without verified payment, and nothing was delivered.
    await expect(authoriseReport(report.id, { via: "link", token: signReportToken(report.id) })).rejects.toMatchObject({ code: "report_locked" });
    expect(await db.job.count({ where: { attemptId: attempt.id, kind: { in: ["deliver_email", "deliver_whatsapp"] } } })).toBe(0);

    await simulateMockPayment(await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } }), "succeeded", "t3");
    expect(await status(attempt.id)).toBe("report_unlocked");
    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("completed");

    const deliveries = await db.job.findMany({ where: { attemptId: attempt.id, kind: { in: ["deliver_email", "deliver_whatsapp"] } } });
    expect(deliveries.map((d) => [d.channel, d.status]).sort()).toEqual([
      ["email", "succeeded"],
      ["whatsapp", "succeeded"],
    ]);

    const authorised = await authoriseReport(report.id, { via: "link", token: signReportToken(report.id) });
    const pdf = await readReportPdf(authorised, { via: "link", correlationId: "t4" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    const owner = await db.job.findMany({ where: { attemptId: attempt.id, kind: "notify_owner" }, select: { purpose: true, status: true } });
    expect(owner).toContainEqual({ purpose: "payment_succeeded", status: "succeeded" });
  });

  it("treats a repeated submission key as the same submission and rejects a second one", async () => {
    const { attempt } = await createAttempt(input("mbti_personality"), "t");
    const first = await submitAttempt(attempt, { answers: mbtiAnswers(), submissionKey: "same-key-123" }, "t");
    const again = await submitAttempt(first, { answers: mbtiAnswers(), submissionKey: "same-key-123" }, "t");
    expect(again.id).toBe(first.id);
    await expect(submitAttempt(first, { answers: mbtiAnswers(), submissionKey: "other-key-456" }, "t")).rejects.toMatchObject({ code: "already_submitted" });
    expect(await db.job.count({ where: { attemptId: attempt.id, kind: "score_attempt" } })).toBe(1);
  });

  it("rejects incomplete submissions without losing saved answers", async () => {
    const { attempt } = await createAttempt(input("mbti_personality"), "t");
    await saveDraftAnswers(attempt, { mbti_q001: "a", mbti_q002: "b" });
    const fresh = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    await expect(submitAttempt(fresh, { answers: {}, submissionKey: "k-incomplete" }, "t")).rejects.toMatchObject({ code: "invalid_request" });
    const after = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("in_progress");
    expect(after.draftAnswers).toEqual({ mbti_q001: "a", mbti_q002: "b" });
  });

  it("unlocks automatically when payment lands before the report is ready", async () => {
    const { attempt } = await createAttempt(input("vark_learning_styles", { whatsapp: "", consents: { dataProcessing: true, ageOrGuardian: true, whatsapp: false } }), "t");
    const submitted = await submitAttempt(attempt, { answers: varkAnswers(), submissionKey: "race-key-1" }, "t");
    await simulateMockPayment(submitted, "succeeded", "t"); // still "submitted"
    expect(await status(attempt.id)).toBe("submitted");
    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("completed");
    expect(await db.job.count({ where: { attemptId: attempt.id, kind: "deliver_whatsapp" } })).toBe(0);
  });
});

describe("upfront journey", () => {
  it("requires verified payment before answers are accepted", async () => {
    await reset({ PAYMENT_WORKFLOW_VARK_LEARNING_STYLES: "upfront" });
    const { attempt } = await createAttempt(input("vark_learning_styles"), "t");
    expect(attempt.status).toBe("awaiting_payment");
    await expect(saveDraftAnswers(attempt, { vark_q01: ["a"] })).rejects.toMatchObject({ code: "not_editable" });
    await expect(submitAttempt(attempt, { answers: varkAnswers(), submissionKey: "upfront-1" }, "t")).rejects.toMatchObject({ code: "payment_required" });

    await simulateMockPayment(attempt, "succeeded", "t");
    const open = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(open.status).toBe("in_progress");
    await submitAttempt(open, { answers: varkAnswers(), submissionKey: "upfront-2" }, "t");
    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("completed");
  });
});

describe("Razorpay webhooks", () => {
  async function setupRazorpay() {
    await reset({ PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "key_secret", RAZORPAY_WEBHOOK_SECRET: "hook_secret" });
    let orders = 0;
    const fakeFetch = (async () => new Response(JSON.stringify({ id: `order_test_${++orders}` }), { status: 200 })) as typeof fetch;
    setPaymentProviderForTests(createRazorpayProvider({ keyId: "rzp_test_key", keySecret: "key_secret", webhookSecret: "hook_secret" }, fakeFetch));
  }

  const signed = (body: string, eventId: string) =>
    new Headers({ "x-razorpay-signature": hmacHex("hook_secret", body), "x-razorpay-event-id": eventId });

  it("processes a verified capture once, however many times it is delivered", async () => {
    await setupRazorpay();
    const { attempt } = await createAttempt(input("mbti_personality"), "t");
    const submitted = await submitAttempt(attempt, { answers: mbtiAnswers(), submissionKey: "rzp-key-1" }, "t");
    await runDueJobs({ attemptId: attempt.id });
    const session = await createPaymentSession(await db.attempt.findUniqueOrThrow({ where: { id: submitted.id } }), "t");
    expect(session).toMatchObject({ provider: "razorpay", keyId: "rzp_test_key", amount: 49900, currency: "INR" });

    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_abc", order_id: session.orderId, amount: 49900, currency: "INR", status: "captured" } } },
    });
    expect(await processPaymentWebhook("razorpay", body, signed(body, "evt_1"), "w1")).toBe("payment_succeeded");
    expect(await processPaymentWebhook("razorpay", body, signed(body, "evt_1"), "w2")).toBe("duplicate");
    // Same capture re-sent under a new event id (e.g. order.paid): still no second effect.
    expect(await processPaymentWebhook("razorpay", body, signed(body, "evt_2"), "w3")).toBe("payment_succeeded");

    const payments = await db.payment.findMany({ where: { attemptId: attempt.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "succeeded", providerPaymentId: "pay_abc", verificationSource: "webhook" });
    expect(await db.auditEvent.count({ where: { eventType: "payment.succeeded" } })).toBe(1);
    expect(await db.job.count({ where: { attemptId: attempt.id, kind: "deliver_email" } })).toBe(1);
  });

  it("rejects forged webhooks and never unlocks on an amount mismatch", async () => {
    await setupRazorpay();
    const { attempt } = await createAttempt(input("mbti_personality"), "t");
    await submitAttempt(attempt, { answers: mbtiAnswers(), submissionKey: "rzp-key-2" }, "t");
    await runDueJobs({ attemptId: attempt.id });
    const session = await createPaymentSession(await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } }), "t");
    const cheap = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_cheap", order_id: session.orderId, amount: 100, currency: "INR", status: "captured" } } },
    });
    const forged = new Headers({ "x-razorpay-signature": hmacHex("wrong", cheap), "x-razorpay-event-id": "evt_x" });
    await expect(processPaymentWebhook("razorpay", cheap, forged, "w")).rejects.toMatchObject({ status: 401 });
    expect(await processPaymentWebhook("razorpay", cheap, signed(cheap, "evt_cheap"), "w")).toBe("amount_mismatch");
    expect(await status(attempt.id)).toBe("report_ready_locked");
  });
});

describe("failure and recovery", () => {
  it("dead report generation marks the attempt failed; admin retry recovers without a new payment", async () => {
    const { attempt } = await createAttempt(input("vark_learning_styles"), "t");
    await submitAttempt(attempt, { answers: varkAnswers(), submissionKey: "fail-key-1" }, "t");
    await simulateMockPayment(await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } }), "succeeded", "t");

    // Break storage so report generation fails, and make this the final allowed attempt.
    await reset({ REPORT_STORAGE: "filesystem", REPORT_STORAGE_DIR: `${process.cwd()}/package.json/not-a-directory` });
    await runDueJobs({ attemptId: attempt.id, limit: 1 }); // scoring succeeds
    await db.job.updateMany({ where: { attemptId: attempt.id, kind: "generate_report" }, data: { maxAttempts: 1 } });
    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("failed");
    const dead = await db.job.findFirstOrThrow({ where: { attemptId: attempt.id, kind: "generate_report" } });
    expect(dead.status).toBe("dead");
    expect(await db.job.count({ where: { attemptId: attempt.id, kind: "notify_owner", purpose: "report_generation_failed" } })).toBe(1);

    await reset();
    await retryJob(dead.id, "admin@example.test", "t");
    await runDueJobs({ attemptId: attempt.id });
    expect(await status(attempt.id)).toBe("completed");
    expect(await db.payment.count({ where: { attemptId: attempt.id } })).toBe(1);

    const again = await resendReport(attempt.id, "admin@example.test", "t");
    expect(again.queued).toBeGreaterThan(0);
  });

  it("refuses to resend a report that is not unlocked", async () => {
    const { attempt } = await createAttempt(input("vark_learning_styles"), "t");
    await expect(resendReport(attempt.id, "admin@example.test", "t")).rejects.toBeInstanceOf(AppError);
  });
});

describe("reports and limits", () => {
  it("re-renders a stored result to the same bytes (checksum reproducibility)", async () => {
    const { attempt } = await createAttempt(input("mbti_personality"), "t");
    await submitAttempt(attempt, { answers: mbtiAnswers("a"), submissionKey: "repro-1" }, "t");
    await runDueJobs({ attemptId: attempt.id });
    const a = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { result: true } });
    const stored = await db.report.findFirstOrThrow({ where: { attemptId: attempt.id } });
    const again = await renderReport(buildReportData(a, a.result!));
    expect(again.checksum).toBe(stored.checksum);
  });

  it("enforces rate limits across calls via the database", async () => {
    const rule = { bucket: "test", limit: 2, windowSeconds: 60 };
    await enforceRateLimit(rule, "1.2.3.4");
    await enforceRateLimit(rule, "1.2.3.4");
    await expect(enforceRateLimit(rule, "1.2.3.4")).rejects.toMatchObject({ code: "rate_limited" });
    await enforceRateLimit(rule, "5.6.7.8");
  });
});

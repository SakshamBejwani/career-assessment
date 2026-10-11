import "server-only";
import { z } from "zod";
import type { Attempt } from "@/generated/prisma/client";
import { POST_SUBMIT_PAYABLE, type AttemptStatus } from "@/lib/status";
import type { AssessmentId } from "@/lib/assessment-ids";
import { getDefinition } from "../assessments/registry";
import { getConfig } from "../config";
import { getDb, isUniqueViolation } from "../db";
import { AppError, Errors } from "../errors";
import { logger } from "../observability/logger";
import { getPaymentProvider } from "../payments";
import { PaymentProviderError } from "../payments/types";
import { recordAudit } from "./audit";
import { emitOwnerEvent } from "./queue";
import { transitionAttempt } from "./transitions";
import { tryUnlock } from "./unlock";

export const checkoutConfirmationSchema = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(16).max(128),
});

export const mockPaymentSchema = z.object({ outcome: z.enum(["succeeded", "failed"]) });

export interface CheckoutSession {
  provider: "razorpay" | "mock";
  orderId: string;
  keyId: string | null;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
}

function assertPayable(attempt: Attempt) {
  if (attempt.paidAt) throw Errors.conflict("already_paid", "This assessment is already paid for.");
  const status = attempt.status as AttemptStatus;
  const ok = attempt.paymentWorkflow === "upfront" ? status === "awaiting_payment" : POST_SUBMIT_PAYABLE.includes(status);
  if (!ok) {
    throw Errors.conflict(
      "payment_not_due",
      attempt.paymentWorkflow === "post_completion" && status === "in_progress"
        ? "Submit your answers first. Payment unlocks the report."
        : "Payment isn't due for this assessment right now.",
    );
  }
}

/** Creates a provider order for the server-side price, or reuses the pending one. */
export async function createPaymentSession(attempt: Attempt, correlationId: string): Promise<CheckoutSession> {
  assertPayable(attempt);
  const db = getDb();
  const config = getConfig();
  const provider = getPaymentProvider();
  const def = getDefinition(attempt.assessmentId as AssessmentId);

  let payment = await db.payment.findFirst({
    where: { attemptId: attempt.id, status: "pending", provider: provider.name, amount: attempt.priceAmount, currency: attempt.currency },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) {
    let orderId: string;
    try {
      ({ orderId } = await provider.createOrder({
        amount: attempt.priceAmount,
        currency: attempt.currency,
        receipt: attempt.publicRef,
        notes: { attempt_ref: attempt.publicRef, assessment: attempt.assessmentId },
      }));
    } catch (error) {
      logger.error("payment order creation failed", { attemptId: attempt.id, code: (error as PaymentProviderError).code });
      throw Errors.unavailable("We couldn't start the payment. Try again in a moment.");
    }
    payment = await db.payment.create({
      data: {
        attemptId: attempt.id,
        provider: provider.name,
        providerOrderId: orderId,
        amount: attempt.priceAmount,
        currency: attempt.currency,
        status: "pending",
      },
    });
    await recordAudit({ actorType: "student", eventType: "payment.session_created", entityType: "payment", entityId: payment.id, correlationId });
  }

  return {
    provider: provider.name,
    orderId: payment.providerOrderId!,
    keyId: provider.publicKey(),
    amount: payment.amount,
    currency: payment.currency,
    name: config.orgName,
    description: `${def.shortName} report ${attempt.publicRef}`,
    prefill: { name: attempt.contactName, email: attempt.contactEmail, ...(attempt.contactWhatsapp ? { contact: attempt.contactWhatsapp } : {}) },
  };
}

/**
 * The only way a payment becomes `succeeded`. The guarded update means exactly one caller
 * (client confirmation, webhook, or a duplicate of either) performs the follow-up effects.
 */
export async function markPaymentSucceeded(
  paymentId: string,
  input: { providerPaymentId: string | null; source: "client_confirmation" | "webhook" | "mock" | "admin_reconcile"; correlationId?: string },
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  let flipped: boolean;
  try {
    flipped = await db.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: { not: "succeeded" } },
        data: {
          status: "succeeded",
          verifiedAt: now,
          verificationSource: input.source,
          failureReason: null,
          ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
        },
      });
      if (count !== 1) return false;
      await tx.attempt.updateMany({ where: { id: payment.attemptId, paidAt: null }, data: { paidAt: now } });
      // Upfront workflow: payment opens the questionnaire.
      await transitionAttempt(payment.attemptId, ["awaiting_payment"], "in_progress", { startedAt: now }, tx);
      await recordAudit(
        {
          actorType: input.source === "webhook" ? "provider" : "system",
          eventType: "payment.succeeded",
          entityType: "payment",
          entityId: paymentId,
          correlationId: input.correlationId,
          metadata: { source: input.source, amount: payment.amount, currency: payment.currency },
        },
        tx,
      );
      await emitOwnerEvent("payment_succeeded", { attemptId: payment.attemptId, entityId: paymentId }, tx);
      return true;
    });
  } catch (error) {
    // The same provider payment id already recorded on this payment by a concurrent caller.
    if (isUniqueViolation(error)) return false;
    throw error;
  }
  if (flipped) {
    logger.metric("payment_succeeded", { source: input.source });
    await tryUnlock(payment.attemptId, input.correlationId);
  }
  return flipped;
}

export async function markPaymentFailed(paymentId: string, reason: string, correlationId?: string): Promise<boolean> {
  const db = getDb();
  const { count } = await db.payment.updateMany({
    where: { id: paymentId, status: "pending" },
    data: { status: "failed", failureReason: reason.slice(0, 200) },
  });
  if (count === 1) {
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await recordAudit({ actorType: "system", eventType: "payment.failed", entityType: "payment", entityId: paymentId, correlationId, metadata: { reason: reason.slice(0, 80) } });
    await emitOwnerEvent("payment_failed", { attemptId: payment.attemptId, entityId: paymentId });
    logger.metric("payment_failed", {});
  }
  return count === 1;
}

/** Razorpay Checkout success callback. Verifies the signature AND the order status with Razorpay. */
export async function confirmCheckout(
  attempt: Attempt,
  input: z.infer<typeof checkoutConfirmationSchema>,
  correlationId: string,
): Promise<{ status: "succeeded" | "pending" }> {
  const provider = getPaymentProvider();
  const payment = await getDb().payment.findFirst({ where: { attemptId: attempt.id, providerOrderId: input.razorpay_order_id } });
  if (!payment) throw Errors.notFound("Payment");
  if (payment.status === "succeeded") return { status: "succeeded" };

  const signatureOk = provider.verifyCheckoutSignature({
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    signature: input.razorpay_signature,
  });
  if (!signatureOk) {
    await recordAudit({ actorType: "student", eventType: "payment.signature_rejected", entityType: "payment", entityId: payment.id, correlationId });
    throw new AppError("invalid_signature", "We couldn't verify this payment. If money was taken, it will be confirmed automatically shortly.", 400);
  }

  let order;
  try {
    order = await provider.fetchOrderStatus(input.razorpay_order_id);
  } catch {
    // Signature is valid but we can't confirm capture right now; the webhook will finish it.
    return { status: "pending" };
  }
  if (order.paid && order.amountPaid === payment.amount && order.currency === payment.currency) {
    await markPaymentSucceeded(payment.id, { providerPaymentId: order.paymentId ?? input.razorpay_payment_id, source: "client_confirmation", correlationId });
    return { status: "succeeded" };
  }
  return { status: "pending" };
}

/** Non-production simulation through the same domain path as real payments. */
export async function simulateMockPayment(attempt: Attempt, outcome: "succeeded" | "failed", correlationId: string) {
  const config = getConfig();
  if (config.isProduction || config.payments.provider !== "mock") throw Errors.notFound();
  await createPaymentSession(attempt, correlationId);
  const payment = await getDb().payment.findFirstOrThrow({ where: { attemptId: attempt.id, status: "pending", provider: "mock" }, orderBy: { createdAt: "desc" } });
  if (outcome === "succeeded") {
    await markPaymentSucceeded(payment.id, { providerPaymentId: `mock_pay_${payment.id}`, source: "mock", correlationId });
  } else {
    await markPaymentFailed(payment.id, "simulated_failure", correlationId);
  }
}

/** Verified, de-duplicated webhook processing. Returns a short outcome label for logs/tests. */
export async function processPaymentWebhook(providerName: string, rawBody: string, headers: Headers, correlationId: string): Promise<string> {
  const provider = getPaymentProvider();
  if (provider.name !== providerName) throw Errors.notFound();
  let outcome;
  try {
    outcome = provider.parseWebhook(rawBody, headers);
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      logger.warn("webhook rejected", { provider: providerName, code: error.code, correlationId });
      throw new AppError("invalid_webhook", "Webhook could not be verified.", 401);
    }
    throw error;
  }

  const db = getDb();
  let eventRow;
  try {
    eventRow = await db.paymentEvent.create({ data: { provider: providerName, eventId: outcome.eventId, eventType: outcome.eventType } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    eventRow = await db.paymentEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: providerName, eventId: outcome.eventId } } });
    if (eventRow.processedAt) return "duplicate";
  }

  let label: string = outcome.kind;
  if (outcome.kind !== "ignored") {
    const payment = await db.payment.findUnique({ where: { providerOrderId: outcome.orderId } });
    if (!payment) {
      label = "unknown_order";
      logger.warn("webhook for unknown order", { provider: providerName, correlationId });
    } else if (outcome.kind === "payment_succeeded") {
      if (outcome.amount !== payment.amount || outcome.currency !== payment.currency) {
        label = "amount_mismatch";
        logger.error("webhook amount mismatch", { paymentId: payment.id, correlationId });
        await recordAudit({ actorType: "provider", eventType: "payment.amount_mismatch", entityType: "payment", entityId: payment.id, correlationId });
      } else {
        await markPaymentSucceeded(payment.id, { providerPaymentId: outcome.paymentId, source: "webhook", correlationId });
      }
    } else {
      await markPaymentFailed(payment.id, outcome.reason, correlationId);
    }
  }
  await db.paymentEvent.update({ where: { id: eventRow.id }, data: { processedAt: new Date() } });
  return label;
}

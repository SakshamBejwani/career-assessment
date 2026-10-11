import { apiHandler, assertSameOrigin, json, readJson } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { getAuthorisedAttempt } from "@/server/workflow/attempts";
import { checkoutConfirmationSchema, confirmCheckout } from "@/server/workflow/payments";
import { scheduleJobRun } from "@/server/workflow/runner";

export const maxDuration = 60;

/** Razorpay Checkout handler callback. Informational until verified server-side. */
export const POST = apiHandler<{ id: string }>(async ({ req, params, requestId }) => {
  assertSameOrigin(req);
  const attempt = await getAuthorisedAttempt(params.id);
  await enforceRateLimit(RATE_RULES.paymentSession, attempt.id);
  const input = await readJson(req, checkoutConfirmationSchema);
  const result = await confirmCheckout(attempt, input, requestId);
  scheduleJobRun({ attemptId: attempt.id });
  return json(result);
});

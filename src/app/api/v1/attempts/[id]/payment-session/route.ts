import { apiHandler, assertSameOrigin, json } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { getAuthorisedAttempt } from "@/server/workflow/attempts";
import { createPaymentSession } from "@/server/workflow/payments";

export const POST = apiHandler<{ id: string }>(async ({ req, params, requestId }) => {
  assertSameOrigin(req);
  const attempt = await getAuthorisedAttempt(params.id);
  await enforceRateLimit(RATE_RULES.paymentSession, attempt.id);
  return json(await createPaymentSession(attempt, requestId));
});

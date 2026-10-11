import { apiHandler, json } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { processPaymentWebhook } from "@/server/workflow/payments";
import { scheduleJobRun } from "@/server/workflow/runner";

export const maxDuration = 60;

/** Provider webhooks. Authenticated by HMAC over the raw body, not by cookies or origin. */
export const POST = apiHandler<{ provider: string }>(async ({ req, params, ip, requestId }) => {
  await enforceRateLimit(RATE_RULES.webhook, ip);
  const rawBody = await req.text();
  if (rawBody.length > 256 * 1024) return json({ error: { code: "too_large", message: "Payload too large", reference: requestId } }, { status: 413 });
  const outcome = await processPaymentWebhook(params.provider, rawBody, req.headers, requestId);
  scheduleJobRun({ limit: 10 });
  return json({ received: true, outcome });
});

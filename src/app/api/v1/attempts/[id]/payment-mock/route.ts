import { getConfig } from "@/server/config";
import { Errors } from "@/server/errors";
import { apiHandler, assertSameOrigin, json, readJson } from "@/server/http";
import { getAuthorisedAttempt } from "@/server/workflow/attempts";
import { mockPaymentSchema, simulateMockPayment } from "@/server/workflow/payments";
import { scheduleJobRun } from "@/server/workflow/runner";

export const maxDuration = 60;

/** Development/staging only: simulate a payment outcome through the real domain path. */
export const POST = apiHandler<{ id: string }>(async ({ req, params, requestId }) => {
  const config = getConfig();
  if (config.isProduction || config.payments.provider !== "mock") throw Errors.notFound();
  assertSameOrigin(req);
  const attempt = await getAuthorisedAttempt(params.id);
  const { outcome } = await readJson(req, mockPaymentSchema);
  await simulateMockPayment(attempt, outcome, requestId);
  scheduleJobRun({ attemptId: attempt.id });
  return json({ status: outcome });
});

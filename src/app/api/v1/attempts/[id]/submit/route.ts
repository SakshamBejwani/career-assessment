import { apiHandler, assertSameOrigin, json, readJson } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { attemptView, getAuthorisedAttempt, submitAttempt, submitSchema } from "@/server/workflow/attempts";
import { scheduleJobRun } from "@/server/workflow/runner";

export const maxDuration = 60;

export const POST = apiHandler<{ id: string }>(async ({ req, params, requestId }) => {
  assertSameOrigin(req);
  const attempt = await getAuthorisedAttempt(params.id);
  await enforceRateLimit(RATE_RULES.submit, attempt.id);
  const input = await readJson(req, submitSchema);
  const updated = await submitAttempt(attempt, input, requestId);
  scheduleJobRun({ attemptId: updated.id });
  return json(await attemptView(updated));
});

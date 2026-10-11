import { apiHandler, json } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { attemptView, getAuthorisedAttempt } from "@/server/workflow/attempts";
import { hasDueJobs, scheduleJobRun } from "@/server/workflow/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Status for the attempt owner. Polling also nudges any due background work for this attempt. */
export const GET = apiHandler<{ id: string }>(async ({ params, ip }) => {
  await enforceRateLimit(RATE_RULES.status, ip);
  const attempt = await getAuthorisedAttempt(params.id);
  if (await hasDueJobs(attempt.id)) scheduleJobRun({ attemptId: attempt.id, limit: 10 });
  return json(await attemptView(attempt));
});

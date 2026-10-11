import { apiHandler, assertSameOrigin, json, readJson } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { getAuthorisedAttempt, saveAnswersSchema, saveDraftAnswers } from "@/server/workflow/attempts";

export const PUT = apiHandler<{ id: string }>(async ({ req, params }) => {
  assertSameOrigin(req);
  const attempt = await getAuthorisedAttempt(params.id);
  await enforceRateLimit(RATE_RULES.saveResponses, attempt.id);
  const { answers } = await readJson(req, saveAnswersSchema);
  return json(await saveDraftAnswers(attempt, answers));
});

import { apiHandler, json } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { attemptView, getAuthorisedAttempt } from "@/server/workflow/attempts";

export const dynamic = "force-dynamic";

export const GET = apiHandler<{ id: string }>(async ({ params, ip }) => {
  await enforceRateLimit(RATE_RULES.status, ip);
  const view = await attemptView(await getAuthorisedAttempt(params.id));
  return json({ status: view.status, statusLabel: view.statusLabel, paid: view.paid, report: view.report, deliveries: view.deliveries });
});

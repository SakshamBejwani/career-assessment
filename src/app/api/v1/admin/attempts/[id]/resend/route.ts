import { resendReport } from "@/server/admin";
import { apiHandler, assertSameOrigin, json } from "@/server/http";
import { requireAdmin } from "@/server/security/require-admin";
import { scheduleJobRun } from "@/server/workflow/runner";

export const maxDuration = 60;

export const POST = apiHandler<{ id: string }>(async ({ req, params, requestId }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const result = await resendReport(params.id, admin.email, requestId);
  scheduleJobRun({ attemptId: params.id });
  return json(result);
});

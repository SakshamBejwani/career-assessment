import { attemptDetail } from "@/server/admin";
import { apiHandler, json } from "@/server/http";
import { requireAdmin } from "@/server/security/require-admin";

export const dynamic = "force-dynamic";

export const GET = apiHandler<{ id: string }>(async ({ params, requestId }) => {
  const admin = await requireAdmin();
  return json(await attemptDetail(params.id, admin.email, requestId));
});

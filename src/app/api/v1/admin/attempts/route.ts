import { listAttempts } from "@/server/admin";
import { apiHandler, json } from "@/server/http";
import { requireAdmin } from "@/server/security/require-admin";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req }) => {
  await requireAdmin();
  const p = req.nextUrl.searchParams;
  return json(
    await listAttempts({
      status: p.get("status") ?? undefined,
      assessmentId: p.get("assessment") ?? undefined,
      q: p.get("q") ?? undefined,
      attention: p.get("attention") === "1",
      page: Number(p.get("page") ?? 1) || 1,
    }),
  );
});

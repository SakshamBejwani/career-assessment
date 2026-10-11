import { ConfigError, getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

/** Readiness: configuration is valid and the database answers. */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = { config: "ok", database: "ok" };
  try {
    getConfig();
  } catch (error) {
    checks.config = "fail";
    if (error instanceof ConfigError) logger.error("readiness: config invalid", { problems: error.problems });
  }
  if (checks.config === "ok") {
    try {
      await getDb().$queryRawUnsafe("SELECT 1");
    } catch (error) {
      checks.database = "fail";
      logger.error("readiness: database unreachable", { error });
    }
  } else {
    checks.database = "fail";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json({ status: ok ? "ready" : "not_ready", checks }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

import { getConfig } from "@/server/config";
import { Errors } from "@/server/errors";
import { apiHandler, json } from "@/server/http";
import { safeEqual } from "@/server/security/crypto";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";
import { runDueJobs } from "@/server/workflow/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains due background jobs. Called by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`),
 * hPanel cron on Hostinger, or any external scheduler.
 */
export const GET = apiHandler(async ({ req }) => {
  const secret = getConfig().secrets.cron;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw Errors.unauthorized("Invalid cron credentials.");
  const { ran } = await runDueJobs({ limit: 50, budgetMs: 50_000 });
  const purged = await purgeExpiredRateLimits();
  return json({ ran, purgedRateLimits: purged });
});

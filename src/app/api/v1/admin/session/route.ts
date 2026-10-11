import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { apiHandler, assertSameOrigin, readJson } from "@/server/http";
import { ADMIN_COOKIE, adminCookieOptions, checkAdminCredentials, signAdminSession } from "@/server/security/admin-session";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { recordAudit } from "@/server/workflow/audit";

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export const POST = apiHandler(async ({ req, ip, requestId }) => {
  assertSameOrigin(req);
  await enforceRateLimit(RATE_RULES.adminLoginIp, ip);
  const { email, password } = await readJson(req, loginSchema);
  const normalised = email.trim().toLowerCase();
  await enforceRateLimit(RATE_RULES.adminLoginEmail, normalised);
  if (!(await checkAdminCredentials(normalised, password))) {
    await recordAudit({ actorType: "admin", actorId: normalised, eventType: "admin.login_failed", entityType: "admin_session", entityId: "-", correlationId: requestId });
    throw new AppError("invalid_credentials", "That email and password don't match an admin account.", 401);
  }
  await recordAudit({ actorType: "admin", actorId: normalised, eventType: "admin.login", entityType: "admin_session", entityId: "-", correlationId: requestId });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, signAdminSession(normalised), adminCookieOptions());
  return res;
});

export const DELETE = apiHandler(async ({ req }) => {
  assertSameOrigin(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
  return res;
});

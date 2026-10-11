import { NextResponse } from "next/server";
import { apiHandler, assertSameOrigin, readJson } from "@/server/http";
import { attemptCookieName, attemptCookieOptions } from "@/server/security/attempt-access";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { createAttempt, createAttemptSchema } from "@/server/workflow/attempts";

export const POST = apiHandler(async ({ req, ip, requestId }) => {
  assertSameOrigin(req);
  await enforceRateLimit(RATE_RULES.createAttempt, ip);
  const input = await readJson(req, createAttemptSchema);
  const { attempt, token } = await createAttempt(input, requestId);
  const res = NextResponse.json({ attemptId: attempt.id, reference: attempt.publicRef, status: attempt.status }, { status: 201 });
  res.cookies.set(attemptCookieName(attempt.id), token, attemptCookieOptions());
  return res;
});

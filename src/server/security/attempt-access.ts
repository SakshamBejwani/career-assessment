import "server-only";
import { cookies } from "next/headers";
import { getConfig } from "../config";
import { randomToken, safeEqual, sha256Hex } from "./crypto";

const COOKIE_PREFIX = "pbca_at_";
const MAX_AGE_SECONDS = 30 * 24 * 3600;

export const attemptCookieName = (attemptId: string) => `${COOKIE_PREFIX}${attemptId}`;

/** New per-attempt secret. Only its SHA-256 is stored; the raw token lives in an httpOnly cookie. */
export function issueAttemptToken(): { token: string; hash: string } {
  const token = randomToken(32);
  return { token, hash: sha256Hex(token) };
}

export function attemptCookieOptions() {
  return {
    httpOnly: true,
    secure: getConfig().appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export function tokenMatches(token: string | undefined, storedHash: string): boolean {
  if (!token) return false;
  return safeEqual(sha256Hex(token), storedHash);
}

/** Reads the caller's token for an attempt from the request cookies. */
export async function readAttemptToken(attemptId: string): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(attemptCookieName(attemptId))?.value;
}

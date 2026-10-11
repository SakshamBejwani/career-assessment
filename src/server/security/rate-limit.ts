import "server-only";
import { getDb, isUniqueViolation } from "../db";
import { Errors } from "../errors";

export interface RateRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES = {
  createAttempt: { bucket: "attempt_create", limit: 10, windowSeconds: 3600 },
  saveResponses: { bucket: "responses_save", limit: 120, windowSeconds: 60 },
  submit: { bucket: "submit", limit: 10, windowSeconds: 60 },
  paymentSession: { bucket: "payment_session", limit: 15, windowSeconds: 600 },
  status: { bucket: "status", limit: 90, windowSeconds: 60 },
  download: { bucket: "download", limit: 30, windowSeconds: 600 },
  adminLoginIp: { bucket: "admin_login_ip", limit: 5, windowSeconds: 900 },
  adminLoginEmail: { bucket: "admin_login_email", limit: 5, windowSeconds: 900 },
  webhook: { bucket: "webhook", limit: 300, windowSeconds: 60 },
} satisfies Record<string, RateRule>;

/** Fixed-window key: the window start is part of the key so old rows simply expire. */
export function windowKey(rule: RateRule, subject: string, now = Date.now()): { key: string; expiresAt: Date } {
  const windowMs = rule.windowSeconds * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  return { key: `${rule.bucket}:${subject}:${start}`.slice(0, 191), expiresAt: new Date(start + windowMs) };
}

/**
 * Database-backed counter so limits hold across serverless instances.
 * Throws AppError(429) when the limit is exceeded. Fails open on database errors
 * (availability over strictness), but logs them via the caller's error handling.
 */
export async function enforceRateLimit(rule: RateRule, subject: string, now = Date.now()): Promise<void> {
  const db = getDb();
  const { key, expiresAt } = windowKey(rule, subject, now);
  let count: number;
  try {
    const row = await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    count = row.count;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Two first-hits raced on insert; the row exists now.
    const row = await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } }, select: { count: true } });
    count = row.count;
  }
  if (count > rule.limit) {
    throw Errors.rateLimited(Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)));
  }
}

export async function purgeExpiredRateLimits(now = new Date()): Promise<number> {
  const { count } = await getDb().rateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}

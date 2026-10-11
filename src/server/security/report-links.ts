import "server-only";
import { getConfig } from "../config";
import { hmacBase64Url, safeEqual } from "./crypto";

/**
 * Signed, expiring report link token: base64url("<reportId>.<expiryEpochSeconds>").<hmac>
 * Grants download of one report until expiry; the unlock rule is re-checked on every use.
 */
export function signReportToken(reportId: string, now = Date.now(), ttlHours = getConfig().reportLinkTtlHours): string {
  const exp = Math.floor(now / 1000) + ttlHours * 3600;
  const body = Buffer.from(`${reportId}.${exp}`).toString("base64url");
  return `${body}.${hmacBase64Url(getConfig().secrets.reportLink, body)}`;
}

export type ReportTokenCheck = { ok: true; reportId: string; expiresAt: Date } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyReportToken(token: string, now = Date.now()): ReportTokenCheck {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  if (!safeEqual(sig, hmacBase64Url(getConfig().secrets.reportLink, body))) return { ok: false, reason: "bad_signature" };
  const decoded = Buffer.from(body, "base64url").toString("utf8");
  const dot = decoded.lastIndexOf(".");
  const reportId = decoded.slice(0, dot);
  const exp = Number(decoded.slice(dot + 1));
  if (!reportId || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, reportId, expiresAt: new Date(exp * 1000) };
}

export function reportLinkUrl(reportId: string): string {
  return `${getConfig().appUrl}/r/${signReportToken(reportId)}`;
}

import { beforeEach, describe, expect, it } from "vitest";
import { resetConfigForTests } from "@/server/config";
import { hashPassword, hmacHex, verifyPassword } from "@/server/security/crypto";
import { signReportToken, verifyReportToken } from "@/server/security/report-links";
import { signAdminSession, verifyAdminSession } from "@/server/security/admin-session";
import { issueAttemptToken, tokenMatches } from "@/server/security/attempt-access";
import { windowKey } from "@/server/security/rate-limit";
import { redact } from "@/server/observability/logger";
import { createRazorpayProvider } from "@/server/payments/providers/razorpay";
import { setTestEnv } from "../support/env";

describe("security primitives", () => {
  beforeEach(async () => {
    setTestEnv({ ADMIN_USERS: `admin@example.com:${await hashPassword("correct horse battery")}` });
    resetConfigForTests();
  });

  it("report links verify, expire and resist tampering", () => {
    const now = Date.UTC(2026, 9, 11);
    const token = signReportToken("report123", now, 1);
    expect(verifyReportToken(token, now)).toMatchObject({ ok: true, reportId: "report123" });
    expect(verifyReportToken(token, now + 2 * 3600_000)).toEqual({ ok: false, reason: "expired" });
    const [body, sig] = token.split(".");
    const forgedBody = Buffer.from("otherreport." + (now / 1000 + 3600)).toString("base64url");
    expect(verifyReportToken(`${forgedBody}.${sig}`, now)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyReportToken(`${body}`, now)).toEqual({ ok: false, reason: "malformed" });
  });

  it("attempt tokens are stored only as hashes", () => {
    const { token, hash } = issueAttemptToken();
    expect(hash).not.toContain(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(token + "x", hash)).toBe(false);
    expect(tokenMatches(undefined, hash)).toBe(false);
  });

  it("admin sessions are signed, expire, and die when the admin is removed", async () => {
    const now = Date.now();
    const cookie = signAdminSession("admin@example.com", now);
    expect(verifyAdminSession(cookie, now)?.email).toBe("admin@example.com");
    expect(verifyAdminSession(cookie, now + 9 * 3600_000)).toBeNull();
    expect(verifyAdminSession(cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")), now)).toBeNull();
    setTestEnv({ ADMIN_USERS: "" });
    resetConfigForTests();
    expect(verifyAdminSession(cookie, now)).toBeNull();
  });

  it("password hashes verify only the right password", async () => {
    const hash = await hashPassword("a long admin password");
    expect(await verifyPassword("a long admin password", hash)).toBe(true);
    expect(await verifyPassword("a long admin passworD", hash)).toBe(false);
  });

  it("rate-limit windows roll over on the boundary", () => {
    const rule = { bucket: "t", limit: 1, windowSeconds: 60 };
    expect(windowKey(rule, "ip", 59_999).key).toBe(windowKey(rule, "ip", 0).key);
    expect(windowKey(rule, "ip", 60_000).key).not.toBe(windowKey(rule, "ip", 0).key);
  });

  it("logger redacts personal data and secrets", () => {
    const out = redact({ email: "a@b.com", note: "call +91 98765 43210 or mail x@y.org", nested: { token: "t", ok: 1 } }) as Record<string, unknown>;
    expect(out.email).toBe("[redacted]");
    expect(out.note).toBe("call [phone] or mail [email]");
    expect(out.nested).toEqual({ token: "[redacted]", ok: 1 });
  });
});

describe("Razorpay verification", () => {
  const rzp = createRazorpayProvider({ keyId: "rzp_test_x", keySecret: "key_secret", webhookSecret: "hook_secret" });

  it("accepts a correct checkout signature and rejects a wrong one", () => {
    const signature = hmacHex("key_secret", "order_1|pay_1");
    expect(rzp.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(rzp.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature })).toBe(false);
  });

  it("parses a signed payment.captured webhook and rejects a bad signature", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, currency: "INR", status: "captured" } } },
    });
    const good = new Headers({ "x-razorpay-signature": hmacHex("hook_secret", body), "x-razorpay-event-id": "evt_1" });
    expect(rzp.parseWebhook(body, good)).toMatchObject({ kind: "payment_succeeded", orderId: "order_1", amount: 49900, eventId: "evt_1" });
    const bad = new Headers({ "x-razorpay-signature": hmacHex("other", body) });
    expect(() => rzp.parseWebhook(body, bad)).toThrowError(/signature/);
    expect(() => rzp.parseWebhook(body + " ", good)).toThrowError(/signature/);
  });
});

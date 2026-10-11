import { beforeEach, describe, expect, it } from "vitest";
import { ConfigError, parseConfig, resetConfigForTests } from "@/server/config";
import { availability } from "@/server/assessments/registry";
import { canTransition, TRANSITIONS } from "@/server/workflow/transitions";
import { backoffMs } from "@/server/workflow/queue";
import { ATTEMPT_STATUSES } from "@/lib/status";
import { setTestEnv } from "../support/env";

describe("configuration", () => {
  beforeEach(() => {
    setTestEnv();
    resetConfigForTests();
  });

  it("refuses mock payments, weak secrets and http URLs in production", () => {
    try {
      parseConfig({ ...process.env, APP_ENV: "production", APP_URL: "http://example.com" });
      throw new Error("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join("\n");
      expect(problems).toMatch(/mock is not allowed/);
      expect(problems).toMatch(/https/);
      expect(problems).toMatch(/ADMIN_USERS/);
    }
  });

  it("requires a price for every enabled assessment", () => {
    expect(() => parseConfig({ ...process.env, PRICE_HOLLAND_RIASEC: "" })).toThrowError(/PRICE_HOLLAND_RIASEC/);
  });

  it("supports per-assessment payment workflow overrides", () => {
    const cfg = parseConfig({ ...process.env, PAYMENT_WORKFLOW: "post_completion", PAYMENT_WORKFLOW_HOLLAND_RIASEC: "upfront" });
    expect(cfg.assessments.workflows.holland_riasec).toBe("upfront");
    expect(cfg.assessments.workflows.vark_learning_styles).toBe("post_completion");
  });
});

describe("approval gate", () => {
  it("serves unapproved modules as labelled previews outside production", () => {
    setTestEnv({ APP_ENV: "staging" });
    resetConfigForTests();
    expect(availability("mbti_personality")).toEqual({ available: true, preview: true });
  });

  it("blocks unapproved modules in production unless explicitly overridden", () => {
    const prod = {
      APP_ENV: "production",
      APP_URL: "https://example.com",
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "k",
      RAZORPAY_KEY_SECRET: "s",
      RAZORPAY_WEBHOOK_SECRET: "w",
      ADMIN_USERS: "a@b.com:scrypt.16384.8.1.c2FsdA.aGFzaA",
    };
    setTestEnv(prod);
    resetConfigForTests();
    expect(availability("vark_learning_styles")).toEqual({ available: false, reason: "pending_approval" });
    setTestEnv({ ...prod, ALLOW_UNAPPROVED_ASSESSMENTS: "true" });
    resetConfigForTests();
    expect(availability("vark_learning_styles")).toEqual({ available: true, preview: true });
  });

  it("disabled modules are unavailable", () => {
    setTestEnv({ ENABLED_ASSESSMENTS: "holland_riasec" });
    resetConfigForTests();
    expect(availability("mbti_personality")).toEqual({ available: false, reason: "disabled" });
  });
});

describe("attempt state machine", () => {
  it("covers every status", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ATTEMPT_STATUSES].sort());
  });

  it("cannot skip the payment gate or re-open a submission", () => {
    expect(canTransition("report_generating", "report_unlocked")).toBe(false);
    expect(canTransition("awaiting_payment", "submitted")).toBe(false);
    expect(canTransition("submitted", "in_progress")).toBe(false);
    expect(canTransition("completed", "report_unlocked")).toBe(false);
    expect(canTransition("report_ready_locked", "report_unlocked")).toBe(true);
  });

  it("backs off exponentially and caps at two hours", () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([30_000, 120_000, 480_000, 1_920_000, 7_200_000, 7_200_000]);
  });
});

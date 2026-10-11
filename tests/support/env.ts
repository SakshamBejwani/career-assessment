// Minimal valid configuration for unit tests (no database is touched).
export function setTestEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    APP_ENV: "development",
    APP_URL: "http://localhost:3000",
    DATABASE_PROVIDER: "postgresql",
    DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
    SESSION_SECRET: "test-session-secret-0123456789-abcdefghijkl",
    REPORT_LINK_SECRET: "test-report-link-secret-0123456789-abcdefgh",
    CRON_SECRET: "test-cron-secret-0123456789",
    PAYMENT_PROVIDER: "mock",
    PRICE_MBTI_PERSONALITY: "49900",
    PRICE_HOLLAND_RIASEC: "49900",
    PRICE_VARK_LEARNING_STYLES: "29900",
    EMAIL_PROVIDER: "log",
    WHATSAPP_PROVIDER: "log",
  };
  for (const key of Object.keys(process.env)) {
    if (/^(APP_|DATABASE_|SESSION_|REPORT_|CRON_|PAYMENT_|PRICE_|EMAIL_|WHATSAPP_|RAZORPAY_|SMTP_|OWNER_|ENABLED_|ALLOW_|ADMIN_|S3_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

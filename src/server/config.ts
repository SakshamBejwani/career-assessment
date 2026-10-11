import "server-only";
import { z } from "zod";
import { ASSESSMENT_IDS, type AssessmentId } from "@/lib/assessment-ids";

const bool = z
  .enum(["true", "false", "1", "0", "yes", "no", ""])
  .optional()
  .transform((v) => v === "true" || v === "1" || v === "yes");

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const workflow = z.enum(["post_completion", "upfront"]);
export type PaymentWorkflow = z.infer<typeof workflow>;

export const OWNER_EVENTS = [
  "assessment_started",
  "assessment_submitted",
  "scoring_completed",
  "scoring_failed",
  "payment_succeeded",
  "payment_failed",
  "report_generated",
  "report_generation_failed",
  "report_delivered",
  "report_delivery_failed",
] as const;
export type OwnerEvent = (typeof OWNER_EVENTS)[number];

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_PROVIDER: z.enum(["postgresql", "mysql"]).default("postgresql"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  REPORT_LINK_SECRET: z.string().min(32, "REPORT_LINK_SECRET must be at least 32 characters"),
  REPORT_LINK_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(168),
  CRON_SECRET: optionalString,

  ENABLED_ASSESSMENTS: csv,
  ALLOW_UNAPPROVED_ASSESSMENTS: bool,

  PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).default("mock"),
  PAYMENT_WORKFLOW: workflow.default("post_completion"),
  CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("INR"),
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,

  EMAIL_PROVIDER: z.enum(["smtp", "log", "none"]).default("log"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: bool.default(true),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_REPLY_TO: optionalString,
  EMAIL_ATTACH_PDF: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  WHATSAPP_PROVIDER: z.enum(["meta", "log", "none"]).default("log"),
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_TEMPLATE_NAME: z.string().default("report_ready"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
  DEFAULT_PHONE_REGION: z.string().length(2).default("IN"),

  OWNER_NOTIFY_EMAILS: csv,
  OWNER_NOTIFY_EVENTS: z
    .string()
    .optional()
    .default("payment_succeeded,scoring_failed,report_generation_failed,report_delivery_failed"),

  REPORT_STORAGE: z.enum(["database", "filesystem", "s3"]).default("database"),
  REPORT_STORAGE_DIR: z.string().default("./storage/reports"),
  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,

  ADMIN_USERS: optionalString,

  JOB_WORKER_INTERVAL_MS: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ERROR_WEBHOOK_URL: optionalString,
  DISPLAY_TIMEZONE: z.string().default("Asia/Kolkata"),

  NEXT_PUBLIC_ORG_NAME: z.string().default("Psychology-Based Career Assessment"),
  SUPPORT_EMAIL: optionalString,
});

export interface AdminUser {
  email: string;
  passwordHash: string;
}

export interface AppConfig {
  env: "development" | "staging" | "production";
  isProduction: boolean;
  appUrl: string;
  appOrigin: string;
  database: { provider: "postgresql" | "mysql"; url: string };
  secrets: { session: string; reportLink: string; cron?: string };
  reportLinkTtlHours: number;
  assessments: {
    enabled: AssessmentId[];
    allowUnapproved: boolean;
    prices: Partial<Record<AssessmentId, number>>;
    workflows: Record<AssessmentId, PaymentWorkflow>;
  };
  payments: {
    provider: "razorpay" | "mock";
    currency: string;
    razorpay?: { keyId: string; keySecret: string; webhookSecret?: string };
  };
  email: {
    provider: "smtp" | "log" | "none";
    smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string };
    from: string;
    replyTo?: string;
    attachPdf: boolean;
  };
  whatsapp: {
    provider: "meta" | "log" | "none";
    meta?: { phoneNumberId: string; accessToken: string };
    templateName: string;
    templateLang: string;
    defaultRegion: string;
  };
  owner: { emails: string[]; events: Set<OwnerEvent> };
  storage: {
    driver: "database" | "filesystem" | "s3";
    dir: string;
    s3?: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  };
  adminUsers: AdminUser[];
  jobWorkerIntervalMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
  errorWebhookUrl?: string;
  displayTimezone: string;
  orgName: string;
  supportEmail?: string;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

const envKey = (id: AssessmentId) => id.toUpperCase();

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const e = parsed.data;
  const problems: string[] = [];
  const isProduction = e.APP_ENV === "production";

  const enabled = (e.ENABLED_ASSESSMENTS.length ? e.ENABLED_ASSESSMENTS : [...ASSESSMENT_IDS]).filter(
    (id): id is AssessmentId => {
      const known = (ASSESSMENT_IDS as readonly string[]).includes(id);
      if (!known) problems.push(`ENABLED_ASSESSMENTS: unknown assessment "${id}"`);
      return known;
    },
  );

  const prices: Partial<Record<AssessmentId, number>> = {};
  const workflows = {} as Record<AssessmentId, PaymentWorkflow>;
  for (const id of ASSESSMENT_IDS) {
    const raw = env[`PRICE_${envKey(id)}`];
    if (raw !== undefined && raw.trim() !== "") {
      const amount = Number(raw);
      if (!Number.isInteger(amount) || amount < 100) {
        problems.push(`PRICE_${envKey(id)} must be an integer amount in minor units (>= 100)`);
      } else {
        prices[id] = amount;
      }
    } else if (enabled.includes(id)) {
      problems.push(`PRICE_${envKey(id)} is required while ${id} is enabled`);
    }
    const wf = env[`PAYMENT_WORKFLOW_${envKey(id)}`];
    const wfParsed = workflow.safeParse(wf && wf.trim() !== "" ? wf : e.PAYMENT_WORKFLOW);
    if (!wfParsed.success) problems.push(`PAYMENT_WORKFLOW_${envKey(id)} must be post_completion or upfront`);
    workflows[id] = wfParsed.success ? wfParsed.data : "post_completion";
  }

  let razorpay: AppConfig["payments"]["razorpay"];
  if (e.PAYMENT_PROVIDER === "razorpay") {
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) {
      problems.push("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay");
    } else {
      razorpay = { keyId: e.RAZORPAY_KEY_ID, keySecret: e.RAZORPAY_KEY_SECRET, webhookSecret: e.RAZORPAY_WEBHOOK_SECRET };
    }
    if (isProduction && !e.RAZORPAY_WEBHOOK_SECRET) {
      problems.push("RAZORPAY_WEBHOOK_SECRET is required in production");
    }
  }
  if (isProduction && e.PAYMENT_PROVIDER === "mock") {
    problems.push("PAYMENT_PROVIDER=mock is not allowed when APP_ENV=production");
  }

  let smtp: AppConfig["email"]["smtp"];
  if (e.EMAIL_PROVIDER === "smtp") {
    if (!e.SMTP_HOST || !e.EMAIL_FROM) problems.push("SMTP_HOST and EMAIL_FROM are required when EMAIL_PROVIDER=smtp");
    else smtp = { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE, user: e.SMTP_USER, password: e.SMTP_PASSWORD };
  }

  let meta: AppConfig["whatsapp"]["meta"];
  if (e.WHATSAPP_PROVIDER === "meta") {
    if (!e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_ACCESS_TOKEN) {
      problems.push("WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required when WHATSAPP_PROVIDER=meta");
    } else {
      meta = { phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID, accessToken: e.WHATSAPP_ACCESS_TOKEN };
    }
  }

  let s3: AppConfig["storage"]["s3"];
  if (e.REPORT_STORAGE === "s3") {
    if (!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
      problems.push("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when REPORT_STORAGE=s3");
    } else {
      s3 = {
        endpoint: e.S3_ENDPOINT.replace(/\/+$/, ""),
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      };
    }
  }

  const ownerEvents = new Set<OwnerEvent>();
  for (const name of e.OWNER_NOTIFY_EVENTS.split(",").map((s) => s.trim()).filter(Boolean)) {
    if ((OWNER_EVENTS as readonly string[]).includes(name)) ownerEvents.add(name as OwnerEvent);
    else problems.push(`OWNER_NOTIFY_EVENTS: unknown event "${name}"`);
  }

  const adminUsers: AdminUser[] = [];
  for (const entry of (e.ADMIN_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = entry.indexOf(":");
    const email = entry.slice(0, idx).trim().toLowerCase();
    const passwordHash = entry.slice(idx + 1).trim();
    if (idx < 1 || !/^scrypt\.\d+\.\d+\.\d+\.[\w-]+\.[\w-]+$/.test(passwordHash)) {
      problems.push("ADMIN_USERS entries must look like email:scrypt.16384.8.1.<salt>.<hash> (use npm run admin:hash-password)");
    } else {
      adminUsers.push({ email, passwordHash });
    }
  }

  if (isProduction) {
    if (!e.APP_URL.startsWith("https://")) problems.push("APP_URL must use https:// in production");
    if (!e.CRON_SECRET || e.CRON_SECRET.length < 16) problems.push("CRON_SECRET (16+ characters) is required in production");
    if (adminUsers.length === 0) problems.push("ADMIN_USERS is required in production");
    if (e.SESSION_SECRET === e.REPORT_LINK_SECRET) problems.push("SESSION_SECRET and REPORT_LINK_SECRET must differ");
    if (/replace-with/.test(e.SESSION_SECRET) || /replace-with/.test(e.REPORT_LINK_SECRET)) {
      problems.push("Replace the placeholder secrets from .env.example");
    }
  }

  if (problems.length) throw new ConfigError(problems);

  const appUrl = e.APP_URL.replace(/\/+$/, "");
  return {
    env: e.APP_ENV,
    isProduction,
    appUrl,
    appOrigin: new URL(appUrl).origin,
    database: { provider: e.DATABASE_PROVIDER, url: e.DATABASE_URL },
    secrets: { session: e.SESSION_SECRET, reportLink: e.REPORT_LINK_SECRET, cron: e.CRON_SECRET },
    reportLinkTtlHours: e.REPORT_LINK_TTL_HOURS,
    assessments: { enabled, allowUnapproved: e.ALLOW_UNAPPROVED_ASSESSMENTS, prices, workflows },
    payments: { provider: e.PAYMENT_PROVIDER, currency: e.CURRENCY, razorpay },
    email: {
      provider: e.EMAIL_PROVIDER,
      smtp,
      from: e.EMAIL_FROM ?? `${e.NEXT_PUBLIC_ORG_NAME} <no-reply@localhost>`,
      replyTo: e.EMAIL_REPLY_TO,
      attachPdf: e.EMAIL_ATTACH_PDF,
    },
    whatsapp: {
      provider: e.WHATSAPP_PROVIDER,
      meta,
      templateName: e.WHATSAPP_TEMPLATE_NAME,
      templateLang: e.WHATSAPP_TEMPLATE_LANG,
      defaultRegion: e.DEFAULT_PHONE_REGION.toUpperCase(),
    },
    owner: { emails: e.OWNER_NOTIFY_EMAILS.map((s) => s.toLowerCase()), events: ownerEvents },
    storage: { driver: e.REPORT_STORAGE, dir: e.REPORT_STORAGE_DIR, s3 },
    adminUsers,
    jobWorkerIntervalMs: e.JOB_WORKER_INTERVAL_MS,
    logLevel: e.LOG_LEVEL,
    errorWebhookUrl: e.ERROR_WEBHOOK_URL,
    displayTimezone: e.DISPLAY_TIMEZONE,
    orgName: e.NEXT_PUBLIC_ORG_NAME,
    supportEmail: e.SUPPORT_EMAIL,
  };
}

let cached: AppConfig | undefined;

/** Validated configuration. Throws ConfigError (listing every problem) on first use if invalid. */
export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Test helper: reset the memoised config after mutating process.env. */
export function resetConfigForTests() {
  cached = undefined;
}

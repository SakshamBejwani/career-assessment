import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Keys whose values must never reach logs (personal data, secrets, answers, provider payloads).
const REDACT_KEYS = new Set([
  "email",
  "contactemail",
  "phone",
  "whatsapp",
  "whatsappe164",
  "contactwhatsapp",
  "name",
  "fullname",
  "contactname",
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "authorization",
  "cookie",
  "secret",
  "signature",
  "answers",
  "answer",
  "responses",
  "scores",
  "payload",
  "body",
  "pdf",
  "data",
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s-]{8,}\d/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase().replace(/[_-]/g, "")) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[level] ?? ORDER.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (level === "error") void forwardError(msg, fields);
}

async function forwardError(msg: string, fields?: Record<string, unknown>) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    const summary = JSON.stringify(redact(fields ?? {})).slice(0, 1500);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` (Slack) and `content` (Discord) are both accepted by common incoming webhooks.
      body: JSON.stringify({ text: `[${process.env.APP_ENV ?? "app"}] ${msg}\n${summary}`, content: `[${process.env.APP_ENV ?? "app"}] ${msg}` }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Never let error forwarding break the request.
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
  /** Counter-style metric line; aggregate in any log drain by `metric` name. */
  metric: (metric: string, fields?: Record<string, unknown>) => write("info", "metric", { metric, ...fields }),
};

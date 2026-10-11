import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "../config";
import { logger } from "../observability/logger";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export class DeliveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly permanent = false,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

let transporter: Transporter | undefined;

function smtp(): Transporter {
  if (transporter) return transporter;
  const cfg = getConfig().email.smtp!;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

/** Sends through the configured adapter. Returns the provider message id when there is one. */
export async function sendEmail(message: EmailMessage): Promise<{ messageId: string | null }> {
  const { email } = getConfig();
  if (email.provider === "none") throw new DeliveryError("email_disabled", "Email delivery is disabled", true);
  if (email.provider === "log") {
    logger.info("email (log adapter)", {
      subjectLength: message.subject.length,
      recipients: Array.isArray(message.to) ? message.to.length : 1,
      attachments: message.attachments?.length ?? 0,
    });
    return { messageId: `log-${Date.now()}` };
  }
  try {
    const info = await smtp().sendMail({
      from: email.from,
      replyTo: email.replyTo,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return { messageId: info.messageId ?? null };
  } catch (error) {
    const responseCode = (error as { responseCode?: number }).responseCode;
    // 5xx SMTP replies (e.g. mailbox does not exist) will not succeed on retry.
    const permanent = typeof responseCode === "number" && responseCode >= 500 && responseCode < 600;
    throw new DeliveryError(permanent ? `smtp_${responseCode}` : "smtp_transient", "SMTP send failed", permanent);
  }
}

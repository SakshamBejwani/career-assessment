import "server-only";
import { firstName, formatDateTime } from "@/lib/format";
import type { OwnerEvent } from "../config";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(orgName: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#EEF1F5;font-family:Arial,Helvetica,sans-serif;color:#17213A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:10px">
<tr><td style="padding:28px 32px 8px;font-size:14px;color:#4A5468">${escape(orgName)}</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export function reportReadyEmail(input: {
  orgName: string;
  studentName: string;
  assessmentName: string;
  reference: string;
  link: string;
  linkTtlHours: number;
  attached: boolean;
  supportEmail?: string;
}) {
  const name = firstName(input.studentName);
  const days = Math.round(input.linkTtlHours / 24);
  const validity = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${input.linkTtlHours} hours`;
  const subject = `Your ${input.assessmentName} report is ready`;
  const lines = [
    `Hi ${name},`,
    `Your ${input.assessmentName} report is ready.${input.attached ? " It's attached to this email as a PDF." : ""}`,
    `You can also download it here for the next ${validity}: ${input.link}`,
    `Your report reference is ${input.reference}. Quote it if you contact us.`,
    input.supportEmail ? `Questions? Reply to this email or write to ${input.supportEmail}.` : "",
  ].filter(Boolean);
  const html = layout(
    input.orgName,
    `<p>Hi ${escape(name)},</p>
<p>Your <strong>${escape(input.assessmentName)}</strong> report is ready.${input.attached ? " It's attached to this email as a PDF." : ""}</p>
<p style="margin:24px 0"><a href="${escape(input.link)}" style="background:#17213A;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Download your report</a></p>
<p style="font-size:13px;color:#4A5468">This link works for the next ${validity}. Your report reference is <strong>${escape(input.reference)}</strong>.</p>
${input.supportEmail ? `<p style="font-size:13px;color:#4A5468">Questions? Write to ${escape(input.supportEmail)}.</p>` : ""}`,
  );
  return { subject, text: lines.join("\n\n"), html };
}

const EVENT_LABEL: Record<OwnerEvent, string> = {
  assessment_started: "Assessment started",
  assessment_submitted: "Assessment submitted",
  scoring_completed: "Scoring completed",
  scoring_failed: "Scoring failed",
  payment_succeeded: "Payment received",
  payment_failed: "Payment failed",
  report_generated: "Report generated",
  report_generation_failed: "Report generation failed",
  report_delivered: "Report delivered",
  report_delivery_failed: "Report delivery failed",
};

/** Minimal operational notice: no student name, contact details, answers or scores (spec FR-07). */
export function ownerNotificationEmail(input: {
  orgName: string;
  event: OwnerEvent;
  reference: string;
  assessmentName: string;
  occurredAt: Date;
  timezone: string;
  adminUrl: string;
}) {
  const label = EVENT_LABEL[input.event];
  const when = formatDateTime(input.occurredAt, input.timezone);
  const subject = `${label}: ${input.reference}`;
  const text = `${label}\n\nReference: ${input.reference}\nAssessment: ${input.assessmentName}\nTime: ${when}\n\nOpen in admin: ${input.adminUrl}`;
  const html = layout(
    input.orgName,
    `<p><strong>${escape(label)}</strong></p>
<p>Reference: ${escape(input.reference)}<br>Assessment: ${escape(input.assessmentName)}<br>Time: ${escape(when)}</p>
<p><a href="${escape(input.adminUrl)}">Open in admin</a></p>`,
  );
  return { subject, text, html };
}

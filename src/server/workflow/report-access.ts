import "server-only";
import type { Report } from "@/generated/prisma/client";
import { getDb } from "../db";
import { AppError, Errors } from "../errors";
import { getReport, type StoredObject } from "../reports/storage";
import { readAttemptToken, tokenMatches } from "../security/attempt-access";
import { sha256Hex } from "../security/crypto";
import { verifyReportToken } from "../security/report-links";
import { recordAudit } from "./audit";
import { hasVerifiedPayment } from "./unlock";

export type ReportAccess = { via: "cookie" } | { via: "link"; token: string };

/** Resolves a downloadable report, enforcing ownership and the unlock rule on every call. */
export async function authoriseReport(reportId: string, access: ReportAccess): Promise<Report> {
  if (access.via === "link") {
    const check = verifyReportToken(access.token);
    if (!check.ok) {
      throw check.reason === "expired"
        ? new AppError("link_expired", "This download link has expired. Open your report from the assessment page or ask us to resend it.", 410)
        : Errors.notFound("Report");
    }
    if (check.reportId !== reportId) throw Errors.notFound("Report");
  }
  const report = await getDb().report.findUnique({ where: { id: reportId }, include: { attempt: { select: { accessTokenHash: true } } } });
  if (!report) throw Errors.notFound("Report");
  if (access.via === "cookie") {
    const token = await readAttemptToken(report.attemptId);
    if (!tokenMatches(token, report.attempt.accessTokenHash)) throw Errors.notFound("Report");
  }
  if (report.status !== "ready" || !(await hasVerifiedPayment(report.attemptId))) {
    throw new AppError("report_locked", "This report unlocks once payment is confirmed.", 403);
  }
  return report;
}

export async function readReportPdf(report: Report, actor: { via: "cookie" | "link"; correlationId: string }): Promise<Buffer> {
  const pdf = await getReport(report.id, { driver: report.storageDriver as StoredObject["driver"], key: report.storageKey! });
  if (report.checksum && sha256Hex(pdf) !== report.checksum) {
    throw new AppError("report_integrity", "This report could not be verified. Contact support with your reference.", 500);
  }
  await recordAudit({
    actorType: "student",
    eventType: actor.via === "link" ? "report.downloaded_via_link" : "report.downloaded",
    entityType: "report",
    entityId: report.id,
    correlationId: actor.correlationId,
  });
  return pdf;
}

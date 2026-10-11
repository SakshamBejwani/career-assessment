import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { formatDateTime } from "@/lib/format";
import { getDefinition } from "@/server/assessments/registry";
import type { AssessmentId } from "@/lib/assessment-ids";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { verifyReportToken } from "@/server/security/report-links";
import { hasVerifiedPayment } from "@/server/workflow/unlock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your report", robots: { index: false, follow: false } };

/** Landing page for the signed link sent by email/WhatsApp. The download re-checks everything. */
export default async function ReportLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const config = getConfig();
  const check = verifyReportToken(decodeURIComponent(token));
  const report = check.ok ? await getDb().report.findUnique({ where: { id: check.reportId }, include: { attempt: true } }) : null;
  const usable = Boolean(check.ok && report && report.status === "ready" && (await hasVerifiedPayment(report.attemptId)));

  return (
    <>
      <SiteHeader orgName={config.orgName} compact />
      <main id="main" className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        {usable && report && check.ok ? (
          <>
            <h1 className="text-3xl sm:text-4xl">Your report is ready</h1>
            <p className="mt-4 text-lg text-slate">
              {getDefinition(report.attempt.assessmentId as AssessmentId).shortName} report for {report.attempt.contactName.split(" ")[0]}, reference{" "}
              {report.attempt.publicRef}.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="btn btn-primary" href={`/api/v1/reports/${report.id}/download?token=${encodeURIComponent(decodeURIComponent(token))}`}>
                Download PDF
              </a>
              <a className="btn btn-secondary" href={`/api/v1/reports/${report.id}/download?inline=1&token=${encodeURIComponent(decodeURIComponent(token))}`}>
                Open in browser
              </a>
            </div>
            <p className="mt-8 text-sm text-slate">This link works until {formatDateTime(check.expiresAt, config.displayTimezone)}. Keep the PDF somewhere safe.</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl sm:text-4xl">{check.ok ? "This report isn't available" : check.reason === "expired" ? "This link has expired" : "This link isn't valid"}</h1>
            <p className="mt-4 text-slate">
              {check.ok || check.reason !== "expired"
                ? "Check that you copied the whole link from your email or WhatsApp message."
                : "Report links stop working after a while to keep your report private. You can still open it from the assessment page in the browser you used, or ask us to send a new link."}
            </p>
            {config.supportEmail ? (
              <p className="mt-4 text-slate">
                Contact <a className="underline" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with your report reference.
              </p>
            ) : null}
            <Link href="/" className="btn btn-secondary mt-8">
              Go to the home page
            </Link>
          </>
        )}
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResultsView } from "@/components/results/ResultsView";
import { AccessProblem } from "@/components/site/AccessProblem";
import { AttemptHeader } from "@/components/site/AttemptHeader";
import { formatDate } from "@/lib/format";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { buildReportData } from "@/server/reports/data";
import { getAuthorisedAttempt } from "@/server/workflow/attempts";
import { hasVerifiedPayment } from "@/server/workflow/unlock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your results", robots: { index: false } };

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let attempt;
  try {
    attempt = await getAuthorisedAttempt(id);
  } catch (error) {
    if (error instanceof AppError) return <AccessProblem />;
    throw error;
  }
  const unlocked = attempt.status === "report_unlocked" || attempt.status === "completed";
  if (!unlocked || !(await hasVerifiedPayment(attempt.id))) redirect(`/attempt/${attempt.id}`);

  const [result, report] = await Promise.all([
    getDb().result.findUniqueOrThrow({ where: { attemptId: attempt.id } }),
    getDb().report.findFirst({ where: { attemptId: attempt.id, status: "ready" }, orderBy: { createdAt: "desc" } }),
  ]);
  const data = buildReportData(attempt, result);

  return (
    <>
      <AttemptHeader title={data.assessment.shortName} width="wide" />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        {data.preview ? (
          <p className="mb-8 rounded-[var(--radius-control)] bg-marigold-soft px-4 py-3 text-sm">
            <strong>Preview.</strong> Scoring and interpretation for this questionnaire are pending validation by its owner.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-8">
          <div>
            <p className="text-slate">Prepared for {data.studentName}</p>
            <h1 className="mt-2 text-3xl sm:text-[2.6rem]">{data.assessment.shortName}</h1>
            <p className="mt-2 text-sm text-slate">
              Report {data.reference}, {formatDate(data.provenance.scoredAt, data.timezone)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {report ? (
              <a href={`/api/v1/reports/${report.id}/download`} className="btn btn-primary">
                Download PDF
              </a>
            ) : null}
            <Link href={`/attempt/${attempt.id}`} className="btn btn-secondary">
              Delivery status
            </Link>
          </div>
        </div>
        <div className="mt-12">
          <ResultsView data={data} />
        </div>
        <section className="mt-16 border-t border-rule pt-8 text-sm text-slate" aria-label="About these results">
          <p className="max-w-[70ch]">
            Your results describe the preferences and interests you reported. They are not a measure of ability, not a diagnosis, and no
            assessment can guarantee career fit or success. Talk them through with a qualified counsellor before making decisions.
          </p>
          <p className="mt-3">
            Scoring method {data.provenance.scoringVersion}. Interpretive text {data.provenance.interpretationVersion}
            {data.provenance.interpretationStatus === "draft" ? " (pending client approval)" : ""}.
          </p>
        </section>
      </main>
    </>
  );
}

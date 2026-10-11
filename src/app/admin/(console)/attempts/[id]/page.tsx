import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/admin/AdminActions";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AssessmentId } from "@/lib/assessment-ids";
import { formatDateTime, formatMoney } from "@/lib/format";
import { attemptDetail } from "@/server/admin";
import { getDefinition } from "@/server/assessments/registry";
import type { AnyScores } from "@/server/assessments/types";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { getAdminSession } from "@/server/security/admin-session";

export const metadata: Metadata = { title: "Attempt", robots: { index: false } };

function summarise(scores: AnyScores): string {
  if (scores.kind === "mbti") return `Type ${scores.typeCode} (${scores.dimensions.map((d) => `${d.first.letter}${d.first.count}/${d.second.letter}${d.second.count}`).join(", ")})`;
  if (scores.kind === "riasec") return scores.ranking.map((code) => `${code} ${scores.categories.find((c) => c.code === code)?.score}`).join(", ");
  return (["V", "A", "R", "K"] as const).map((k) => `${k} ${scores.counts[k]}`).join(", ");
}

export default async function AttemptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const tz = getConfig().displayTimezone;
  let detail;
  try {
    detail = await attemptDetail(id, session.email, randomUUID());
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const { attempt: a, audit } = detail;
  const def = getDefinition(a.assessmentId as AssessmentId);
  const dt = (d: Date | null | undefined) => (d ? formatDateTime(d, tz) : "—");
  const unlocked = a.status === "report_unlocked" || a.status === "completed";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-slate hover:text-ink">
        All attempts
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{a.publicRef}</h1>
        <StatusBadge value={a.status} />
        {a.approvalState !== "approved" ? <span className="rounded-sm bg-marigold-soft px-2 py-0.5 text-xs font-medium">preview</span> : null}
        <span className="ml-auto">
          {unlocked ? <ActionButton path={`/api/v1/admin/attempts/${a.id}/resend`} label="Re-send report" confirm="Send the report to the student again?" done="Queued. Refreshing…" /> : null}
        </span>
      </div>
      {a.failureCode ? <p className="mt-2 text-sm text-alert">Failure: {a.failureCode}</p> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Panel title="Attempt">
          <Rows
            rows={[
              ["Questionnaire", def.shortName],
              ["Versions", `${a.assessmentVersion} / ${a.questionnaireVersion} / ${a.scoringVersion}`],
              ["Template", `${a.reportTemplateVersion}, text ${a.interpretationVersion}`],
              ["Workflow", a.paymentWorkflow.replace("_", " ")],
              ["Price", formatMoney(a.priceAmount, a.currency)],
              ["Answers stored", String(a._count.responses)],
              ["Started", dt(a.startedAt ?? a.createdAt)],
              ["Submitted", dt(a.submittedAt)],
              ["Paid", dt(a.paidAt)],
              ["Completed", dt(a.completedAt)],
            ]}
          />
        </Panel>
        <Panel title="Contact and consent">
          <Rows
            rows={[
              ["Name", a.contactName],
              ["Email", a.contactEmail],
              ["WhatsApp", a.contactWhatsapp ? `${a.contactWhatsapp}${a.deliverWhatsapp ? " (opted in)" : " (not opted in)"}` : "—"],
              ...a.consents.map((c) => [c.purpose.replaceAll("_", " "), `${c.granted ? "Yes" : "No"}, ${c.textVersion}`] as [string, string]),
            ]}
          />
        </Panel>
        <Panel title="Result">
          {a.result ? (
            <Rows
              rows={[
                ["Summary", summarise(a.result.scores as unknown as AnyScores)],
                ["Scoring", a.result.scoringVersion],
                ["Scored", dt(a.result.scoredAt)],
                ["Checksum", a.result.responsesChecksum.slice(0, 16) + "…"],
              ]}
            />
          ) : (
            <p className="text-sm text-slate">Not scored yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Payments" className="mt-6">
        <Table
          head={["Provider", "Order", "Payment", "Amount", "Status", "Verified", "Source"]}
          rows={a.payments.map((p) => [
            p.provider,
            p.providerOrderId ?? "—",
            p.providerPaymentId ?? "—",
            formatMoney(p.amount, p.currency),
            <StatusBadge key="s" value={p.status} />,
            dt(p.verifiedAt),
            p.verificationSource ?? p.failureReason ?? "—",
          ])}
          empty="No payment started."
        />
      </Panel>

      <Panel title="Reports" className="mt-6">
        <Table
          head={["Status", "Template", "Text", "Size", "Storage", "Generated", "Checksum"]}
          rows={a.reports.map((r) => [
            <StatusBadge key="s" value={r.status} />,
            r.templateVersion,
            r.interpretationVersion,
            r.byteSize ? `${Math.round(r.byteSize / 1024)} KB` : "—",
            r.storageDriver ?? "—",
            dt(r.generatedAt),
            r.checksum ? r.checksum.slice(0, 12) + "…" : r.errorCode ?? "—",
          ])}
          empty="No report yet."
        />
      </Panel>

      <Panel title="Background jobs and deliveries" className="mt-6">
        <Table
          head={["Job", "Channel", "Status", "Attempts", "Next run", "Last error", ""]}
          rows={a.jobs.map((j) => [
            `${j.kind.replaceAll("_", " ")}${j.purpose ? ` (${j.purpose.split("-").slice(0, 2).join(" ")})` : ""}`,
            j.channel ?? "—",
            <StatusBadge key="s" value={j.status} />,
            `${j.attempts} / ${j.maxAttempts}`,
            j.status === "failed" || j.status === "pending" ? dt(j.runAt) : "—",
            j.lastErrorCode ?? "—",
            j.status === "failed" || j.status === "dead" ? <ActionButton key="r" path={`/api/v1/admin/jobs/${j.id}/retry`} label="Retry now" done="Retrying. Refreshing…" /> : "",
          ])}
          empty="No jobs."
        />
      </Panel>

      <Panel title="Audit trail" className="mt-6">
        <ol className="space-y-1.5 text-sm">
          {audit.map((e) => (
            <li key={e.id} className="grid grid-cols-[11rem_1fr] gap-3">
              <span className="text-slate">{dt(e.createdAt)}</span>
              <span>
                {e.eventType}
                <span className="text-slate">
                  {" "}
                  by {e.actorType}
                  {e.actorId ? ` ${e.actorId}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </main>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius-control)] border border-rule bg-paper p-5 ${className}`}>
      <h2 className="mb-4 font-sans text-base font-medium tracking-normal">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3">
          <dt className="text-slate first-letter:uppercase">{k}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-slate">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="pb-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

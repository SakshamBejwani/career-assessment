import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ASSESSMENT_IDS, type AssessmentId } from "@/lib/assessment-ids";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ATTEMPT_STATUSES } from "@/lib/status";
import { attentionCount, listAttempts } from "@/server/admin";
import { getDefinition } from "@/server/assessments/registry";
import { getConfig } from "@/server/config";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

type Search = Promise<Record<string, string | undefined>>;

export default async function AdminHome({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const config = getConfig();
  const [list, attention] = await Promise.all([
    listAttempts({ status: sp.status, assessmentId: sp.assessment, q: sp.q, attention: sp.attention === "1", page: Number(sp.page ?? 1) || 1 }),
    attentionCount(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin?${p.toString()}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Attempts</h1>
          <p className="mt-1 text-sm text-slate">{list.total} matching</p>
        </div>
        <Link
          href={sp.attention === "1" ? qs({ attention: undefined, page: undefined }) : qs({ attention: "1", page: undefined })}
          className={`btn min-h-0 px-4 py-2 text-sm ${attention > 0 ? "bg-alert-soft text-alert" : "btn-secondary"}`}
        >
          {sp.attention === "1" ? "Show all" : `Needs attention (${attention})`}
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin">
        <div>
          <label className="field-label text-sm" htmlFor="q">
            Email or reference
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="field-input min-h-0 py-2" placeholder="name@ or PBCA-" />
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="assessment">
            Questionnaire
          </label>
          <select id="assessment" name="assessment" defaultValue={sp.assessment ?? ""} className="field-input min-h-0 py-2">
            <option value="">All</option>
            {ASSESSMENT_IDS.map((id) => (
              <option key={id} value={id}>
                {getDefinition(id).shortName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="field-input min-h-0 py-2">
            <option value="">All</option>
            {ATTEMPT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {sp.attention === "1" ? <input type="hidden" name="attention" value="1" /> : null}
        <button className="btn btn-primary min-h-0 py-2.5 text-sm" type="submit">
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-[var(--radius-control)] border border-rule bg-paper">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-rule text-slate">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Questionnaire</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate">
                  No attempts match these filters.
                </td>
              </tr>
            ) : (
              list.rows.map((r) => (
                <tr key={r.id} className="hover:bg-mist/60">
                  <td className="px-4 py-3">
                    <Link className="font-medium underline-offset-2 hover:underline" href={`/admin/attempts/${r.id}`}>
                      {r.publicRef}
                    </Link>
                    {r.approvalState !== "approved" ? <span className="ml-2 text-xs text-slate">preview</span> : null}
                  </td>
                  <td className="px-4 py-3">{getDefinition(r.assessmentId as AssessmentId).shortName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={r.status} />
                    {r.deadJobs ? <span className="ml-2 text-xs text-alert">{r.deadJobs} failed job{r.deadJobs > 1 ? "s" : ""}</span> : null}
                  </td>
                  <td className="px-4 py-3">{r.paidAt ? `Paid ${formatMoney(r.priceAmount, r.currency)}` : <span className="text-slate">Not paid</span>}</td>
                  <td className="px-4 py-3">{r.contactEmail}</td>
                  <td className="px-4 py-3 text-slate">{formatDateTime(r.createdAt, config.displayTimezone)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pagination">
          {list.page > 1 ? <Link href={qs({ page: String(list.page - 1) })} className="btn btn-secondary min-h-0 px-3 py-1.5">Previous</Link> : null}
          <span className="text-slate">
            Page {list.page} of {pages}
          </span>
          {list.page < pages ? <Link href={qs({ page: String(list.page + 1) })} className="btn btn-secondary min-h-0 px-3 py-1.5">Next</Link> : null}
        </nav>
      ) : null}
    </main>
  );
}

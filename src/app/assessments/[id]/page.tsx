import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentGlyph } from "@/components/brand/AssessmentGlyph";
import { StartForm } from "@/components/attempt/StartForm";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { isAssessmentId } from "@/lib/assessment-ids";
import { CONSENT_TEXT } from "@/lib/consent";
import { formatMoney } from "@/lib/format";
import { getActiveVersion, publicSummary } from "@/server/assessments/registry";
import { getConfig } from "@/server/config";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isAssessmentId(id)) return {};
  return { title: publicSummary(id).shortName };
}

export default async function AssessmentPage({ params }: Props) {
  const { id } = await params;
  if (!isAssessmentId(id)) notFound();
  const config = getConfig();
  const a = publicSummary(id);
  const { questionnaire } = getActiveVersion(id);
  const price = a.price !== null ? formatMoney(a.price, a.currency) : null;

  return (
    <>
      <SiteHeader orgName={config.orgName} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6">
        <Link href="/#assessments" className="text-sm text-slate hover:text-ink">
          All questionnaires
        </Link>
        <div className="mt-6 grid gap-12 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-16">
          <div>
            <AssessmentGlyph id={id} size={72} />
            <h1 className="mt-6 text-3xl sm:text-[2.6rem]">{a.shortName}</h1>
            <p className="mt-3 text-lg text-ink">{a.tagline}</p>
            <p className="mt-3 max-w-[60ch] text-slate">{a.description}</p>

            <dl className="mt-8 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-rule bg-rule sm:grid-cols-3">
              {[
                ["Length", `${a.itemCount} ${a.unitLabel}`],
                ["Time", `About ${a.estimatedMinutes} min`],
                ["Price", price ?? "Not set"],
              ].map(([k, v]) => (
                <div key={k} className="bg-paper px-4 py-3">
                  <dt className="text-sm text-slate">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-10" aria-labelledby="before-title">
              <h2 id="before-title" className="text-xl">
                Before you start
              </h2>
              <ul className="mt-4 max-w-[62ch] space-y-2.5">
                {questionnaire.instructions.map((line) => (
                  <li key={line} className="flex gap-3 text-slate">
                    <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-marigold" />
                    <span>{line}</span>
                  </li>
                ))}
                <li className="flex gap-3 text-slate">
                  <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-marigold" />
                  <span>There is no time limit. Your answers save as you go, so you can close the page and come back on this device.</span>
                </li>
              </ul>
            </section>

            <section className="mt-10" aria-labelledby="pay-title">
              <h2 id="pay-title" className="text-xl">
                {a.paymentWorkflow === "upfront" ? "You pay before you start" : "You pay after you finish"}
              </h2>
              <p className="mt-3 max-w-[62ch] text-slate">
                {a.paymentWorkflow === "upfront"
                  ? `Pay ${price ?? ""} after entering your details, then answer the questions. Your report is prepared as soon as you submit.`
                  : `Answer the questions first. When you submit, we prepare your report and you pay ${price ?? ""} to unlock it.`}
              </p>
            </section>

            {a.available && a.preview ? (
              <p className="mt-8 max-w-[62ch] rounded-[var(--radius-control)] bg-marigold-soft px-4 py-3 text-sm text-ink">
                <strong>Preview.</strong> Scoring and report text for this questionnaire are still being validated by its owner. Your report
                will be marked as a preview.
              </p>
            ) : null}
          </div>

          <aside className="lg:pt-2">
            <div className="rounded-[var(--radius-plate)] border border-rule bg-paper p-6 sm:p-8">
              {a.available ? (
                <>
                  <h2 className="text-xl">Your details</h2>
                  <p className="mt-2 text-sm text-slate">We use these to send your report. Nothing else.</p>
                  <StartForm
                    assessmentId={id}
                    upfront={a.paymentWorkflow === "upfront"}
                    consentText={CONSENT_TEXT}
                    defaultRegion={config.whatsapp.defaultRegion}
                    whatsappEnabled={config.whatsapp.provider !== "none"}
                  />
                </>
              ) : (
                <>
                  <h2 className="text-xl">Not available yet</h2>
                  <p className="mt-2 text-slate">This questionnaire isn&apos;t open right now. Check back soon.</p>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter orgName={config.orgName} supportEmail={config.supportEmail} />
    </>
  );
}

import Link from "next/link";
import { AssessmentGlyph } from "@/components/brand/AssessmentGlyph";
import { HeroHexagon } from "@/components/brand/HeroHexagon";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ASSESSMENT_IDS } from "@/lib/assessment-ids";
import { formatMoney } from "@/lib/format";
import { publicSummary } from "@/server/assessments/registry";
import { getConfig } from "@/server/config";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Answer at your own pace",
    body: "Pick one questionnaire and answer honestly. There are no right answers, and your progress saves as you go.",
  },
  {
    title: "Pay once to unlock",
    body: "Pay securely by UPI, card or net banking. The price is shown before you start, and you never pay twice for the same report.",
  },
  {
    title: "Get your report",
    body: "Your personalised PDF is emailed to you, with a WhatsApp link if you ask for one. You can also open it on screen.",
  },
];

export default function HomePage() {
  const config = getConfig();
  const assessments = ASSESSMENT_IDS.map(publicSummary);
  const anyUpfront = assessments.some((a) => a.paymentWorkflow === "upfront");
  const anyAfter = assessments.some((a) => a.paymentWorkflow === "post_completion");
  const previews = assessments.filter((a) => a.available && a.preview);

  return (
    <>
      <SiteHeader orgName={config.orgName} />
      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-14">
          <div>
            <h1 className="max-w-[16ch] text-[2.1rem] sm:text-5xl lg:text-[3.6rem]">See how you think, what draws you and how you learn.</h1>
            <p className="mt-6 max-w-[52ch] text-lg text-slate">
              Three short questionnaires to start a conversation about subjects and careers. Each one gives you a
              personalised report that explains your results in plain language.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="#assessments" className="btn btn-primary">
                Choose a questionnaire
              </Link>
              <Link href="#how-it-works" className="btn btn-quiet">
                How it works
              </Link>
            </div>
          </div>
          <HeroHexagon />
        </section>

        <section id="assessments" className="border-y border-rule bg-paper" aria-labelledby="assessments-title">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
            <h2 id="assessments-title" className="text-2xl sm:text-3xl">
              Choose a questionnaire
            </h2>
            <p className="mt-3 max-w-[60ch] text-slate">Each one is separate, with its own report. You can take more than one.</p>
            {previews.length ? (
              <p className="mt-5 max-w-[70ch] text-sm text-slate">
                <span className="mr-2 inline-block rounded-sm bg-marigold-soft px-1.5 py-0.5 text-xs font-medium text-ink">Preview</span>
                {previews.length === assessments.length
                  ? "Scoring and report text for these questionnaires are still being validated by their owner. Reports are marked as previews."
                  : `${previews.map((a) => a.shortName).join(" and ")}: scoring and report text are still being validated. Reports are marked as previews.`}
              </p>
            ) : null}
            <ul className="mt-10 divide-y divide-rule border-y border-rule">
              {assessments.map((a) => (
                <li key={a.id} className="grid gap-5 py-8 sm:grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
                  <AssessmentGlyph id={a.id} size={64} />
                  <div>
                    <h3 className="text-xl sm:text-2xl">{a.shortName}</h3>
                    <p className="mt-1 text-[1.05rem] text-ink">{a.tagline}</p>
                    <p className="mt-2 max-w-[62ch] text-slate">{a.description}</p>
                    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate">
                      <div className="flex gap-1.5">
                        <dt className="sr-only">Length</dt>
                        <dd>
                          {a.itemCount} {a.unitLabel}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="sr-only">Time</dt>
                        <dd>About {a.estimatedMinutes} minutes</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="sr-only">When you pay</dt>
                        <dd>{a.paymentWorkflow === "upfront" ? "Pay before you start" : "Pay after you finish"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex items-center gap-5 sm:col-start-2 md:col-start-auto md:flex-col md:items-end md:gap-3">
                    {a.price !== null ? <p className="font-display text-xl font-semibold">{formatMoney(a.price, a.currency)}</p> : null}
                    {a.available ? (
                      <Link href={`/assessments/${a.id}`} className="btn btn-primary" aria-label={`Start ${a.shortName}`}>
                        Start
                      </Link>
                    ) : (
                      <span className="rounded-md border border-rule px-3 py-2 text-sm text-slate">Available soon</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24" aria-labelledby="how-title">
          <h2 id="how-title" className="text-2xl sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative pl-14">
                <span aria-hidden="true" className="absolute left-0 top-0 font-mega text-3xl font-semibold leading-none text-marigold">
                  {i + 1}
                </span>
                <h3 className="font-sans text-lg font-medium tracking-normal">{step.title}</h3>
                <p className="mt-2 text-slate">{step.body}</p>
              </li>
            ))}
          </ol>
          {anyUpfront && anyAfter ? (
            <p className="mt-10 max-w-[70ch] text-sm text-slate">
              Some questionnaires are paid before you start and others after you finish. Each one says which applies.
            </p>
          ) : null}
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="report-title">
          <div className="grid gap-10 rounded-[var(--radius-plate)] bg-ink px-6 py-12 text-paper sm:px-10 md:grid-cols-2 md:gap-14 md:py-16">
            <div>
              <h2 id="report-title" className="text-2xl text-paper sm:text-3xl">
                What your report can and can&apos;t tell you
              </h2>
              <p className="mt-4 max-w-[46ch] text-[#c9d0dd]">
                Your report keeps two things separate: what your answers measured, and ideas you might explore next.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <h3 className="font-sans text-base font-medium tracking-normal text-marigold">It can</h3>
                <ul className="mt-3 space-y-2 text-[#e3e7ee]">
                  <li>Describe the preferences and interests you reported</li>
                  <li>Show how strongly your answers leaned each way</li>
                  <li>Suggest areas worth exploring with a counsellor</li>
                </ul>
              </div>
              <div>
                <h3 className="font-sans text-base font-medium tracking-normal text-marigold">It can&apos;t</h3>
                <ul className="mt-3 space-y-2 text-[#e3e7ee]">
                  <li>Measure ability or intelligence</li>
                  <li>Diagnose any condition</li>
                  <li>Guarantee that a career will suit you</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter orgName={config.orgName} supportEmail={config.supportEmail} />
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newKey } from "@/lib/api-client";
import type { AttemptView } from "@/lib/attempt-view";
import type { AnswerMap, Questionnaire } from "@/lib/questionnaire-types";
import { ChecklistRunner } from "./ChecklistRunner";
import { PaymentPanel } from "./PaymentPanel";
import { QuestionRunner } from "./QuestionRunner";

const PROCESSING = new Set(["submitted", "scoring", "scored", "report_generating"]);

function needsPolling(v: AttemptView) {
  if (PROCESSING.has(v.status)) return true;
  if (v.paid && v.status === "report_ready_locked") return true;
  if (v.status === "report_unlocked" && v.deliveries.some((d) => d.status === "pending" || d.status === "running" || d.status === "failed")) return true;
  return false;
}

export function AttemptClient({ initial, questionnaire, supportEmail }: { initial: AttemptView; questionnaire: Questionnaire; supportEmail?: string }) {
  const [view, setView] = useState<AttemptView>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const polls = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setView(await api<AttemptView>(`/api/v1/attempts/${view.id}`));
    } catch {
      // Keep the last known state; the next poll or a reload will catch up.
    }
  }, [view.id]);

  useEffect(() => {
    if (!needsPolling(view)) {
      polls.current = 0;
      return;
    }
    polls.current += 1;
    const delay = polls.current < 40 ? 2000 : 10_000;
    const t = setTimeout(refresh, delay);
    return () => clearTimeout(t);
  }, [view, refresh]);

  const submit = useCallback(
    async (answers: AnswerMap, flush: () => Promise<void>) => {
      setSubmitting(true);
      setSubmitError(null);
      const storageKey = `pbca-submit-${view.id}`;
      let key: string;
      try {
        key = sessionStorage.getItem(storageKey) ?? newKey();
        sessionStorage.setItem(storageKey, key);
      } catch {
        key = newKey();
      }
      try {
        await flush();
        setView(await api<AttemptView>(`/api/v1/attempts/${view.id}/submit`, { body: { answers, submissionKey: key } }));
        window.scrollTo({ top: 0 });
      } catch (error) {
        if (error instanceof ApiError && error.body.code === "already_submitted") {
          await refresh();
        } else {
          setSubmitError(
            error instanceof ApiError
              ? `${error.body.message}${error.body.reference ? ` Reference: ${error.body.reference.slice(0, 8)}.` : ""}`
              : "We couldn't submit your answers. Check your connection and try again.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    },
    [refresh, view.id],
  );

  if (view.status === "in_progress") {
    const Runner = questionnaire.items[0]?.responseType === "boolean_checkbox" ? ChecklistRunner : QuestionRunner;
    return (
      <Runner
        attemptId={view.id}
        questionnaire={questionnaire}
        initialAnswers={view.answers ?? {}}
        allowBack={view.allowBackNavigation}
        onSubmit={submit}
        submitting={submitting}
        submitError={submitError}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {view.preview ? (
        <p className="mb-8 rounded-[var(--radius-control)] bg-marigold-soft px-4 py-3 text-sm">
          <strong>Preview.</strong> Scoring and report text for this questionnaire are still being validated, and your report is marked as a preview.
        </p>
      ) : null}
      {view.status === "awaiting_payment" ? (
        <>
          <h1 className="text-3xl sm:text-4xl">One step before you start</h1>
          <p className="mt-4 max-w-[56ch] text-lg text-slate">
            This questionnaire is paid for before you begin. The questions open as soon as your payment is confirmed.
          </p>
          <div className="mt-10">
            <PaymentPanel
              attemptId={view.id}
              price={view.price}
              currency={view.currency}
              provider={view.paymentProvider}
              heading={`Pay for your ${view.assessment.shortName.toLowerCase()} questionnaire`}
              body="Includes the questionnaire and your personalised PDF report."
              onChanged={refresh}
            />
          </div>
        </>
      ) : (
        <StatusView view={view} onChanged={refresh} supportEmail={supportEmail} />
      )}
      <p className="mt-12 text-sm text-muted">Reference {view.reference}. Quote it if you contact us.</p>
    </div>
  );
}

type StepState = "done" | "current" | "waiting" | "problem";

function StatusView({ view, onChanged, supportEmail }: { view: AttemptView; onChanged: () => void; supportEmail?: string }) {
  const processing = PROCESSING.has(view.status);
  const reportReady = Boolean(view.report);
  const unlocked = view.status === "report_unlocked" || view.status === "completed";
  const sends = view.deliveries.filter((d) => d.purpose === "initial");
  const deliveryProblem = sends.some((d) => d.status === "dead");

  const steps: { title: string; detail: string; state: StepState }[] = [
    { title: "Answers submitted", detail: "Your answers are locked in.", state: "done" },
    {
      title: "Report prepared",
      detail: view.failed ? "Something went wrong while preparing your report. We've been alerted and will fix it." : reportReady ? "Scored and written up." : "Scoring your answers and writing your report.",
      state: view.failed ? "problem" : reportReady ? "done" : "current",
    },
    {
      title: view.paymentWorkflow === "upfront" ? "Paid before you started" : "Payment",
      detail: view.paid ? "Payment confirmed." : view.payable ? "Pay to unlock your report." : "Waiting for your report.",
      state: view.paid ? "done" : view.payable ? "current" : "waiting",
    },
    {
      title: "Report sent to you",
      detail:
        view.status === "completed"
          ? `Sent to ${[view.contact.email, view.contact.whatsappOptIn ? `WhatsApp ${view.contact.whatsapp}` : null].filter(Boolean).join(" and ")}.`
          : deliveryProblem
            ? "We couldn't send it. You can still download it below."
            : unlocked
              ? "Sending now."
              : `We'll email it to ${view.contact.email}${view.contact.whatsappOptIn ? ` and send a WhatsApp link to ${view.contact.whatsapp}` : ""}.`,
      state: view.status === "completed" ? "done" : deliveryProblem ? "problem" : unlocked ? "current" : "waiting",
    },
  ];

  return (
    <>
      <h1 className="text-3xl sm:text-4xl">
        {unlocked ? "Your report is ready" : view.failed ? "Your report needs attention" : processing ? "Preparing your report" : view.payable ? "Your report is ready to unlock" : "Payment received"}
      </h1>
      <p className="mt-4 max-w-[56ch] text-lg text-slate">
        {unlocked
          ? "Open your results on screen or download the PDF. A copy is on its way to you too."
          : view.failed
            ? "Your answers and any payment are safe. You won't need to pay again."
            : processing
              ? "This usually takes a few seconds. You can keep this page open."
              : view.payable
                ? "Your answers have been scored and your report is waiting."
                : "We're finishing up."}
      </p>

      {unlocked && view.report ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/attempt/${view.id}/results`} className="btn btn-primary">
            See your results
          </Link>
          <a href={`/api/v1/reports/${view.report.id}/download`} className="btn btn-secondary">
            Download PDF
          </a>
        </div>
      ) : null}

      {view.payable && view.paymentWorkflow === "post_completion" ? (
        <div className="mt-10">
          <PaymentPanel
            attemptId={view.id}
            price={view.price}
            currency={view.currency}
            provider={view.paymentProvider}
            heading="Unlock your report"
            body="One payment unlocks your results on screen and your PDF report, which we also email to you."
            onChanged={onChanged}
          />
        </div>
      ) : null}

      <ol className="mt-12 space-y-0" aria-label="Progress">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0">
            {i < steps.length - 1 ? <span aria-hidden="true" className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-0.5 bg-rule" /> : null}
            <StepIcon state={step.state} index={i + 1} />
            <div className="pt-1">
              <p className="font-medium">
                {step.title}
                <span className="sr-only">{` (${step.state})`}</span>
              </p>
              <p className={`mt-0.5 text-[0.95rem] ${step.state === "problem" ? "text-alert" : "text-slate"}`}>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {view.failed || deliveryProblem ? (
        <p className="mt-10 max-w-[60ch] text-sm text-slate">
          Need help sooner? {supportEmail ? <>Write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> and quote reference {view.reference}.</> : <>Quote reference {view.reference} when you contact us.</>}
        </p>
      ) : null}
    </>
  );
}

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const base = "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold";
  if (state === "done")
    return (
      <span className={`${base} bg-ink text-paper`} aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (state === "problem")
    return (
      <span className={`${base} bg-alert text-paper`} aria-hidden="true">
        !
      </span>
    );
  if (state === "current")
    return (
      <span className={`${base} border-2 border-marigold bg-paper text-ink`} aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-marigold motion-safe:animate-pulse" />
      </span>
    );
  return (
    <span className={`${base} border-2 border-rule-strong bg-mist text-slate`} aria-hidden="true">
      {index}
    </span>
  );
}

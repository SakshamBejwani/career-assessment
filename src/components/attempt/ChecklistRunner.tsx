"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnswerMap, Questionnaire } from "@/lib/questionnaire-types";
import { SaveIndicator, useAutosave } from "./useAutosave";

/**
 * Holland inventory: one interest area per step, statements grouped "Are you / Can you / Like to"
 * exactly as on the source form. Unticked statements are recorded as "no" on submission.
 */
export function ChecklistRunner({
  attemptId,
  questionnaire,
  initialAnswers,
  allowBack,
  onSubmit,
  submitting,
  submitError,
}: {
  attemptId: string;
  questionnaire: Questionnaire;
  initialAnswers: AnswerMap;
  allowBack: boolean;
  onSubmit: (answers: AnswerMap, flush: () => Promise<void>) => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const sections = questionnaire.sections;
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [step, setStep] = useState(0);
  const { queue, flush, state } = useAutosave(attemptId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewing = step >= sections.length;
  const section = sections[Math.min(step, sections.length - 1)]!;
  const ticked = useMemo(() => Object.values(answers).filter((v) => v === true).length, [answers]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const toggle = (id: string) => {
    const next = answers[id] !== true;
    setAnswers((a) => ({ ...a, [id]: next }));
    queue(id, next);
  };

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
      <div className="sticky top-0 z-10 border-b border-rule bg-mist/95 backdrop-blur">
        <div className="flex h-1 gap-0.5" aria-hidden="true">
          {sections.map((s, i) => (
            <div key={s.id} className={`flex-1 transition-colors ${i < step || reviewing ? "bg-marigold" : i === step ? "bg-marigold/45" : "bg-rule"}`} />
          ))}
        </div>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <p className="text-sm font-medium">
            {reviewing ? "Review" : `Area ${step + 1} of ${sections.length}`}
            <span className="ml-2 hidden font-light text-slate sm:inline">{ticked} ticked so far</span>
          </p>
          <SaveIndicator state={state} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {reviewing ? (
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-[1.9rem] outline-none sm:text-[2.3rem]">
              Ready to submit
            </h2>
            <p className="mt-4 max-w-[58ch] text-slate">
              You ticked {ticked} of {questionnaire.items.length} statements. Anything you left unticked counts as not describing you.
              Submitting locks your answers.
            </p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {sections.map((s, i) => {
                const count = questionnaire.items.filter((it) => it.sectionId === s.id && answers[it.id] === true).length;
                return (
                  <li key={s.id} className="flex items-center justify-between rounded-[var(--radius-control)] bg-paper px-4 py-3">
                    <span>{s.title}</span>
                    <span className="flex items-center gap-3 text-sm text-slate">
                      {count} ticked
                      {allowBack ? (
                        <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setStep(i)}>
                          Change
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {submitError ? (
              <p role="alert" className="mt-6 rounded-[var(--radius-control)] bg-alert-soft px-4 py-3 text-sm text-alert">
                {submitError}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => onSubmit(answers, flush)} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit my answers"}
              </button>
            </div>
          </div>
        ) : (
          <div key={section.id} className="motion-safe:animate-[fadein_200ms_ease-out]">
            <h2 ref={headingRef} tabIndex={-1} className="text-[1.9rem] outline-none sm:text-[2.4rem]">
              {section.title}
            </h2>
            <p className="mt-3 max-w-[60ch] text-slate">
              Tick each statement that describes you. Don&apos;t worry about training or pay; just think about whether you&apos;d like it.
            </p>
            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              {section.groups.map((group) => {
                const groupItems = questionnaire.items.filter((it) => it.groupId === group.id);
                return (
                  <fieldset key={group.id}>
                    <legend className="mb-3 font-display text-lg font-semibold">{group.title}</legend>
                    <div className="space-y-2.5">
                      {groupItems.map((it) => {
                        const on = answers[it.id] === true;
                        return (
                          <label
                            key={it.id}
                            className={`flex min-h-14 cursor-pointer items-center gap-3.5 rounded-[var(--radius-plate)] border-2 bg-paper px-4 py-3 transition-colors ${
                              on ? "border-ink" : "border-transparent hover:border-rule-strong"
                            }`}
                          >
                            <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(it.id)} />
                            <span
                              aria-hidden="true"
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marigold ${
                                on ? "border-ink bg-ink" : "border-rule-strong"
                              }`}
                            >
                              {on ? (
                                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                  <path d="M3 8.5l3 3 7-7" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : null}
                            </span>
                            <span className="text-[1.05rem] font-normal leading-snug">{it.prompt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="mt-10 flex items-center justify-between gap-3">
              {allowBack ? (
                <button type="button" className="btn btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  Previous area
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                {step === sections.length - 1 ? "Review" : "Next area"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

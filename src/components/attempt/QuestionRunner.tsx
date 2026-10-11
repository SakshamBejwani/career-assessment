"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Answer, AnswerMap, Questionnaire, QuestionItem } from "@/lib/questionnaire-types";
import { SaveIndicator, useAutosave } from "./useAutosave";

const isAnswered = (item: QuestionItem, value: Answer | undefined) =>
  value !== undefined && (item.responseType !== "multi_select" || (Array.isArray(value) && value.length > 0));

/**
 * One question per screen (MBTI: single choice, VARK: choose all that apply).
 * Single-choice answers advance automatically; everything is keyboard-operable.
 */
export function QuestionRunner({
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
  const items = questionnaire.items;
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const firstOpen = items.findIndex((i) => !isAnswered(i, initialAnswers[i.id]));
  const [index, setIndex] = useState(firstOpen === -1 ? items.length : firstOpen);
  const { queue, flush, state } = useAutosave(attemptId);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const answeredCount = useMemo(() => items.filter((i) => isAnswered(i, answers[i.id])).length, [items, answers]);
  const reviewing = index >= items.length;
  const item = items[Math.min(index, items.length - 1)]!;
  const value = answers[item.id];
  const multi = item.responseType === "multi_select";

  const goTo = useCallback(
    (next: number) => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      setIndex(Math.max(0, Math.min(items.length, next)));
    },
    [items.length],
  );

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  const choose = useCallback(
    (key: string) => {
      if (multi) {
        const current = Array.isArray(value) ? value : [];
        const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
        setAnswers((a) => ({ ...a, [item.id]: next }));
        queue(item.id, next);
        return;
      }
      setAnswers((a) => ({ ...a, [item.id]: key }));
      queue(item.id, key);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => setIndex((i) => (i === index ? i + 1 : i)), 260);
    },
    [item.id, multi, queue, value, index],
  );

  useEffect(() => {
    if (reviewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const keys = item.options?.map((o) => o.key) ?? [];
      const k = e.key.toLowerCase();
      const byNumber = /^[1-9]$/.test(k) ? keys[Number(k) - 1] : undefined;
      if (keys.includes(k) || byNumber) {
        e.preventDefault();
        choose(byNumber ?? k);
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && isAnswered(item, value)) {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === "ArrowLeft" && allowBack && index > 0) {
        e.preventDefault();
        goTo(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowBack, choose, goTo, index, item, reviewing, value]);

  const progress = Math.round((answeredCount / items.length) * 100);

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
      <div className="sticky top-0 z-10 border-b border-rule bg-mist/95 backdrop-blur">
        <div
          className="h-1 bg-marigold transition-[width] duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={answeredCount}
        />
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <p className="text-sm font-medium">
            {reviewing ? "Review" : `Question ${item.number ?? index + 1} of ${items.length}`}
            <span className="ml-2 hidden font-light text-slate sm:inline">{answeredCount} answered</span>
          </p>
          <SaveIndicator state={state} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {reviewing ? (
          <ReviewScreen
            items={items}
            answers={answers}
            onJump={(i) => goTo(i)}
            onSubmit={() => onSubmit(answers, flush)}
            submitting={submitting}
            submitError={submitError}
            headingRef={headingRef}
            allowBack={allowBack}
          />
        ) : (
          <div key={item.id} className="motion-safe:animate-[fadein_200ms_ease-out]">
            {/* Short sentence stems get the wide display face; long scenarios read better in the text face. */}
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={
                item.prompt.length > 80
                  ? "max-w-[44ch] font-sans text-[1.3rem] font-normal leading-normal tracking-normal outline-none sm:text-[1.6rem]"
                  : "max-w-[28ch] text-[1.65rem] leading-snug outline-none sm:text-[2.1rem]"
              }
            >
              {item.prompt}
            </h2>
            <p className="mt-3 text-sm text-slate">
              {multi ? "Choose every answer that fits. Choose more than one if a single answer doesn't." : "Choose the answer that fits you best."}
              {!item.scored ? " This question is part of the questionnaire but is not scored." : ""}
            </p>
            <div className="mt-8 space-y-3" role={multi ? "group" : "radiogroup"} aria-label={item.prompt}>
              {item.options?.map((option, i) => {
                const selected = multi ? Array.isArray(value) && value.includes(option.key) : value === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role={multi ? "checkbox" : "radio"}
                    aria-checked={selected}
                    onClick={() => choose(option.key)}
                    className={`group flex w-full items-center gap-4 rounded-[var(--radius-plate)] border-2 px-4 py-4 text-left transition-colors sm:px-5 sm:py-5 ${
                      selected ? "border-ink bg-paper" : "border-transparent bg-paper hover:border-rule-strong"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 font-display text-sm font-semibold uppercase transition-colors ${
                        multi ? "rounded-lg" : "rounded-full"
                      } ${selected ? "border-ink bg-ink text-paper" : "border-rule-strong text-slate group-hover:border-ink"}`}
                    >
                      {option.key}
                    </span>
                    <span className="text-[1.08rem] font-normal leading-snug sm:text-[1.15rem]">{option.text}</span>
                    <span className="sr-only">{`, press ${option.key.toUpperCase()} or ${i + 1}`}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-10 flex items-center justify-between gap-3">
              {allowBack ? (
                <button type="button" className="btn btn-quiet" onClick={() => goTo(index - 1)} disabled={index === 0}>
                  Previous
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-4">
                <p className="hidden text-sm text-muted md:block">
                  Keys {item.options?.map((o) => o.key.toUpperCase()).join(" ")}
                  {multi ? ", Enter for next" : ""}
                </p>
                {multi || isAnswered(item, value) ? (
                  <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)} disabled={!isAnswered(item, value)}>
                    {index === items.length - 1 ? "Review answers" : "Next"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewScreen({
  items,
  answers,
  onJump,
  onSubmit,
  submitting,
  submitError,
  headingRef,
  allowBack,
}: {
  allowBack: boolean;
  items: QuestionItem[];
  answers: AnswerMap;
  onJump: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const missing = items.map((item, i) => ({ item, i })).filter(({ item }) => item.required && !isAnswered(item, answers[item.id]));
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-[1.9rem] outline-none sm:text-[2.3rem]">
        {missing.length ? "A few questions still need an answer" : "All questions answered"}
      </h2>
      {missing.length ? (
        <>
          <p className="mt-4 max-w-[56ch] text-slate">Answer these before you submit. Your other answers are saved.</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {missing.map(({ item, i }) => (
              <li key={item.id}>
                <button type="button" className="btn btn-secondary min-h-0 px-4 py-2 text-sm" onClick={() => onJump(i)}>
                  Question {item.number ?? i + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-[56ch] text-slate">
            Submitting locks your answers. We then score them and prepare your report, which takes a few seconds.
          </p>
          {submitError ? (
            <p role="alert" className="mt-6 rounded-[var(--radius-control)] bg-alert-soft px-4 py-3 text-sm text-alert">
              {submitError}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit my answers"}
            </button>
            {allowBack ? (
              <button type="button" className="btn btn-quiet" onClick={() => onJump(0)} disabled={submitting}>
                Go back over my answers
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

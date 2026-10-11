import type { Answer, AnswerMap, Questionnaire, QuestionItem } from "@/lib/questionnaire-types";

export interface ValidationIssue {
  questionId: string;
  problem: "unknown_question" | "invalid_value" | "missing";
}

function valueIsValid(item: QuestionItem, value: Answer): boolean {
  const keys = new Set((item.options ?? []).map((o) => o.key));
  switch (item.responseType) {
    case "single_choice":
      return typeof value === "string" && keys.has(value);
    case "multi_select":
      return (
        Array.isArray(value) &&
        value.length <= keys.size &&
        new Set(value).size === value.length &&
        value.every((v) => typeof v === "string" && keys.has(v))
      );
    case "boolean_checkbox":
      return typeof value === "boolean";
  }
}

function isAnswered(item: QuestionItem, value: Answer | undefined): boolean {
  if (value === undefined) return false;
  if (item.responseType === "multi_select") return Array.isArray(value) && value.length > 0;
  return true;
}

/**
 * Validates answers against a questionnaire version.
 * mode "partial": autosave — unknown/invalid values rejected, missing allowed.
 * mode "complete": submission — additionally every required item must be answered.
 */
export function validateAnswers(questionnaire: Questionnaire, answers: AnswerMap, mode: "partial" | "complete"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const items = new Map(questionnaire.items.map((i) => [i.id, i]));
  for (const [questionId, value] of Object.entries(answers)) {
    const item = items.get(questionId);
    if (!item) issues.push({ questionId, problem: "unknown_question" });
    else if (!valueIsValid(item, value)) issues.push({ questionId, problem: "invalid_value" });
  }
  if (mode === "complete") {
    for (const item of questionnaire.items) {
      if (item.required && !isAnswered(item, answers[item.id])) issues.push({ questionId: item.id, problem: "missing" });
    }
  }
  return issues;
}

/** Canonical form for checksums: keys sorted, multi-select values sorted. */
export function canonicalAnswers(questionnaire: Questionnaire, answers: AnswerMap): AnswerMap {
  const out: AnswerMap = {};
  for (const item of questionnaire.items) {
    const value = answers[item.id];
    if (value === undefined) continue;
    out[item.id] = Array.isArray(value) ? [...value].sort() : value;
  }
  return out;
}

/** Fills explicit `false` for unticked checkboxes so the stored snapshot is complete. */
export function withCheckboxDefaults(questionnaire: Questionnaire, answers: AnswerMap): AnswerMap {
  const out: AnswerMap = { ...answers };
  for (const item of questionnaire.items) {
    if (item.responseType === "boolean_checkbox" && out[item.id] === undefined) out[item.id] = false;
  }
  return out;
}

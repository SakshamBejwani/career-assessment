import key from "@/content/scoring-keys/vark_learning_styles.v1.0.0.json";
import { ScoringError, type Scorer, type VarkCode, type VarkScores } from "../types";

export const VARK_SCORING_VERSION = "vark-scoring-1.0.0";
const CODES: VarkCode[] = ["V", "A", "R", "K"];
const answerKey = key.answerKey as Record<string, Record<string, VarkCode>>;

/**
 * Counts the V/A/R/K letter of every selected option using the chart on PDF page 3.
 * Multiple selections per question are allowed by the source. Q1 has no key and is not scored.
 * No thresholds are applied because the source supplies none.
 */
export const varkScorerV1: Scorer<VarkScores> = {
  scoringVersion: VARK_SCORING_VERSION,
  score({ questionnaire, responses }) {
    if (questionnaire.questionnaireVersion !== key.questionnaireVersion) {
      throw new ScoringError("key_mismatch", "Scoring key does not match questionnaire version");
    }
    const counts: Record<VarkCode, number> = { V: 0, A: 0, R: 0, K: 0 };
    const unscoredItems: string[] = [];
    const items = new Map(questionnaire.items.map((i) => [i.id, i]));
    for (const id of Object.keys(responses)) {
      if (!items.has(id)) throw new ScoringError("unknown_question", `Unknown question ${id}`);
    }

    let total = 0;
    for (const item of questionnaire.items) {
      const value = responses[item.id];
      if (item.required && (!Array.isArray(value) || value.length === 0)) {
        throw new ScoringError("incomplete_responses", `Missing answer for ${item.id}`, { questionId: item.id });
      }
      if (value !== undefined && !Array.isArray(value)) {
        throw new ScoringError("invalid_responses", `Invalid answer for ${item.id}`, { questionId: item.id });
      }
      const mapping = answerKey[item.id];
      if (!mapping) {
        unscoredItems.push(item.id);
        continue;
      }
      for (const option of value ?? []) {
        const category = mapping[option];
        if (!category) throw new ScoringError("invalid_responses", `Option ${option} has no category for ${item.id}`, { questionId: item.id });
        counts[category] += 1;
        total += 1;
      }
    }

    const max = Math.max(...CODES.map((c) => counts[c]));
    return {
      scoringVersion: VARK_SCORING_VERSION,
      scores: {
        kind: "vark",
        counts,
        names: key.categoryNames as Record<VarkCode, string>,
        totalScoredSelections: total,
        highest: max > 0 ? CODES.filter((c) => counts[c] === max) : [],
        unscoredItems,
      },
      warnings: [],
    };
  },
};

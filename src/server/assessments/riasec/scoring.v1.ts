import key from "@/content/scoring-keys/holland_riasec.v1.0.0.json";
import { ScoringError, type RiasecBand, type RiasecCategoryScore, type RiasecCode, type RiasecScores, type Scorer } from "../types";

export const RIASEC_SCORING_VERSION = "riasec-scoring-1.0.0";

export function riasecBand(score: number): RiasecBand {
  const level = key.levels.find((l) => score >= l.min && score <= l.max);
  if (!level) throw new ScoringError("invalid_responses", `Score ${score} outside source bands`);
  return level.label as RiasecBand;
}

/**
 * One point per ticked statement (0–12 per category), banded with the source table
 * (High 9–12, Mid 5–8, Low 0–4). Point-per-check is the documented reading of the form,
 * pending client confirmation.
 */
export const riasecScorerV1: Scorer<RiasecScores> = {
  scoringVersion: RIASEC_SCORING_VERSION,
  score({ questionnaire, responses }) {
    if (questionnaire.questionnaireVersion !== key.questionnaireVersion) {
      throw new ScoringError("key_mismatch", "Scoring key does not match questionnaire version");
    }
    const known = new Set(questionnaire.items.map((i) => i.id));
    for (const id of Object.keys(responses)) {
      if (!known.has(id)) throw new ScoringError("unknown_question", `Unknown question ${id}`);
    }

    const unranked = key.categories.map((c) => {
      let score = 0;
      for (const id of c.questionIds) {
        const value = responses[id];
        if (value === true) score += 1;
        else if (value === undefined) throw new ScoringError("incomplete_responses", `Missing answer for ${id}`, { questionId: id });
        else if (value !== false) throw new ScoringError("invalid_responses", `Invalid answer for ${id}`, { questionId: id });
      }
      return { code: c.code as RiasecCode, name: c.name, score, max: c.questionIds.length, band: riasecBand(score) };
    });

    // Dense ranking: equal scores share a rank. Sorting is stable, so ties keep source order.
    const sorted = [...unranked].sort((x, y) => y.score - x.score);
    const distinct = [...new Set(sorted.map((c) => c.score))];
    const categories: RiasecCategoryScore[] = unranked.map((c) => ({ ...c, rank: distinct.indexOf(c.score) + 1 }));
    const topScore = distinct[0] ?? 0;
    return {
      scoringVersion: RIASEC_SCORING_VERSION,
      scores: {
        kind: "riasec",
        categories,
        ranking: sorted.map((c) => c.code),
        topCodes: categories.filter((c) => c.score === topScore).map((c) => c.code),
      },
      warnings: [],
    };
  },
};

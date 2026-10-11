import key from "@/content/scoring-keys/mbti_personality.v1.0.0.json";
import { ScoringError, type MbtiDimension, type MbtiLetter, type MbtiScores, type Scorer } from "../types";

export const MBTI_SCORING_VERSION = "mbti-scoring-1.0.0";

/**
 * Implements the answer sheet on PDF page 6 of `TEST 1 (PERSONALITY).pdf`:
 * tally a/b per group of seven, combine groups 2+3, 4+5, 6+7, larger total wins.
 * Ties (not covered by the source) are reported as "X" — engineering default pending client approval.
 */
export const mbtiScorerV1: Scorer<MbtiScores> = {
  scoringVersion: MBTI_SCORING_VERSION,
  score({ questionnaire, responses }) {
    if (questionnaire.questionnaireVersion !== key.questionnaireVersion) {
      throw new ScoringError("key_mismatch", "Scoring key does not match questionnaire version");
    }
    const known = new Set(questionnaire.items.map((i) => i.id));
    for (const id of Object.keys(responses)) {
      if (!known.has(id)) throw new ScoringError("unknown_question", `Unknown question ${id}`);
    }

    const groups = key.groups.map(({ group, questionIds }) => {
      let a = 0;
      let b = 0;
      for (const id of questionIds) {
        const value = responses[id];
        if (value === "a") a += 1;
        else if (value === "b") b += 1;
        else if (value === undefined) throw new ScoringError("incomplete_responses", `Missing answer for ${id}`, { questionId: id });
        else throw new ScoringError("invalid_responses", `Invalid answer for ${id}`, { questionId: id });
      }
      return { group, a, b };
    });

    const dimensions: MbtiDimension[] = key.pairs.map((p) => {
      const members = groups.filter((g) => p.groups.includes(g.group));
      const firstCount = members.reduce((sum, g) => sum + g.a, 0);
      const secondCount = members.reduce((sum, g) => sum + g.b, 0);
      const preferred = firstCount === secondCount ? null : ((firstCount > secondCount ? p.first : p.second) as MbtiLetter);
      return {
        pair: p.pair as MbtiDimension["pair"],
        first: { letter: p.first as MbtiLetter, count: firstCount },
        second: { letter: p.second as MbtiLetter, count: secondCount },
        total: firstCount + secondCount,
        preferred,
      };
    });

    const typeCode = dimensions.map((d) => d.preferred ?? "X").join("");
    const ties = dimensions.filter((d) => d.preferred === null).map((d) => d.pair);
    const warnings = ties.length ? [`Balanced preference on ${ties.join(", ")}: reported as X (tie rule pending client approval).`] : [];
    return { scoringVersion: MBTI_SCORING_VERSION, scores: { kind: "mbti", typeCode, dimensions, groups, ties }, warnings };
  },
};

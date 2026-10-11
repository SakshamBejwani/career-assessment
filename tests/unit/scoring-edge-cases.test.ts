import { describe, expect, it } from "vitest";
import mbtiQ from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import riasecQ from "@/content/questionnaires/holland_riasec.v1.0.0.json";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import type { AnswerMap, Questionnaire } from "@/lib/questionnaire-types";
import { mbtiScorerV1 } from "@/server/assessments/mbti/scoring.v1";
import { riasecBand, riasecScorerV1 } from "@/server/assessments/riasec/scoring.v1";
import { ScoringError } from "@/server/assessments/types";
import { varkScorerV1 } from "@/server/assessments/vark/scoring.v1";

const mq = mbtiQ as Questionnaire;
const rq = riasecQ as Questionnaire;
const vq = varkQ as Questionnaire;
const allMbti = (v: string): AnswerMap => Object.fromEntries(mq.items.map((i) => [i.id, v]));

describe("MBTI scoring", () => {
  it("is deterministic", () => {
    const r1 = mbtiScorerV1.score({ questionnaire: mq, responses: allMbti("a") });
    const r2 = mbtiScorerV1.score({ questionnaire: mq, responses: allMbti("a") });
    expect(r1).toEqual(r2);
  });

  it("refuses incomplete answers instead of guessing", () => {
    const r = allMbti("a");
    delete r.mbti_q070;
    expect(() => mbtiScorerV1.score({ questionnaire: mq, responses: r })).toThrowError(ScoringError);
  });

  it("refuses out-of-range values and unknown questions", () => {
    expect(() => mbtiScorerV1.score({ questionnaire: mq, responses: { ...allMbti("a"), mbti_q001: "c" } })).toThrowError(/Invalid/);
    expect(() => mbtiScorerV1.score({ questionnaire: mq, responses: { ...allMbti("a"), mbti_q071: "a" } })).toThrowError(/Unknown/);
  });

  it("uses the seven answer-sheet groups from the source", () => {
    const { scores } = mbtiScorerV1.score({ questionnaire: mq, responses: allMbti("a") });
    expect(scores.groups.map((g) => g.a)).toEqual([10, 10, 10, 10, 10, 10, 10]);
  });
});

describe("RIASEC scoring", () => {
  it("bands exactly at the source boundaries", () => {
    expect([0, 4, 5, 8, 9, 12].map(riasecBand)).toEqual(["Low", "Low", "Mid", "Mid", "High", "High"]);
  });

  it("gives tied categories the same rank", () => {
    const responses = Object.fromEntries(rq.items.map((i) => [i.id, false])) as AnswerMap;
    const { scores } = riasecScorerV1.score({ questionnaire: rq, responses });
    expect(new Set(scores.categories.map((c) => c.rank))).toEqual(new Set([1]));
    expect(scores.topCodes).toEqual(["R", "I", "A", "S", "E", "C"]);
  });

  it("rejects non-boolean answers", () => {
    const responses = Object.fromEntries(rq.items.map((i) => [i.id, false])) as AnswerMap;
    responses.riasec_r_are_01 = "yes";
    expect(() => riasecScorerV1.score({ questionnaire: rq, responses })).toThrowError(ScoringError);
  });
});

describe("VARK scoring", () => {
  const base = (): AnswerMap => Object.fromEntries(vq.items.map((i) => [i.id, ["a"]]));

  it("never scores question 1", () => {
    const r1 = varkScorerV1.score({ questionnaire: vq, responses: base() });
    const r2 = varkScorerV1.score({ questionnaire: vq, responses: { ...base(), vark_q01: ["a", "b", "c", "d"] } });
    expect(r2.scores.counts).toEqual(r1.scores.counts);
    expect(r1.scores.unscoredItems).toEqual(["vark_q01"]);
  });

  it("requires at least one selection per question", () => {
    expect(() => varkScorerV1.score({ questionnaire: vq, responses: { ...base(), vark_q05: [] } })).toThrowError(/Missing/);
  });

  it("rejects an option that does not exist for that question", () => {
    // Q5 has only options a–c in the source.
    expect(() => varkScorerV1.score({ questionnaire: vq, responses: { ...base(), vark_q05: ["d"] } })).toThrowError(ScoringError);
  });

  it("does not render source item 15 (an instruction)", () => {
    expect(vq.items.map((i) => i.number)).not.toContain(15);
  });
});

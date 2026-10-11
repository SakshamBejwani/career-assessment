import { describe, expect, it } from "vitest";
import mbtiQ from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import riasecQ from "@/content/questionnaires/holland_riasec.v1.0.0.json";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import type { Questionnaire } from "@/lib/questionnaire-types";
import { canonicalAnswers, validateAnswers, withCheckboxDefaults } from "@/server/assessments/validate";

const mq = mbtiQ as Questionnaire;
const rq = riasecQ as Questionnaire;
const vq = varkQ as Questionnaire;

describe("answer validation", () => {
  it("partial mode allows missing answers but rejects bad ones", () => {
    expect(validateAnswers(mq, { mbti_q001: "a" }, "partial")).toEqual([]);
    expect(validateAnswers(mq, { mbti_q001: "z" }, "partial")).toEqual([{ questionId: "mbti_q001", problem: "invalid_value" }]);
    expect(validateAnswers(mq, { nope: "a" }, "partial")).toEqual([{ questionId: "nope", problem: "unknown_question" }]);
  });

  it("complete mode lists every missing required item", () => {
    const issues = validateAnswers(mq, { mbti_q001: "a" }, "complete");
    expect(issues.filter((i) => i.problem === "missing")).toHaveLength(69);
  });

  it("multi-select rejects duplicates and empty selections count as missing", () => {
    expect(validateAnswers(vq, { vark_q02: ["a", "a"] }, "partial")[0]?.problem).toBe("invalid_value");
    const all = Object.fromEntries(vq.items.map((i) => [i.id, ["a"]]));
    expect(validateAnswers(vq, { ...all, vark_q03: [] }, "complete")).toEqual([{ questionId: "vark_q03", problem: "missing" }]);
  });

  it("checkbox defaults make an untouched RIASEC form complete", () => {
    expect(validateAnswers(rq, withCheckboxDefaults(rq, {}), "complete")).toEqual([]);
  });

  it("canonical form sorts multi-select values so checksums are stable", () => {
    expect(canonicalAnswers(vq, { vark_q02: ["d", "a"] })).toEqual({ vark_q02: ["a", "d"] });
  });
});

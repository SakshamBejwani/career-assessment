import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import mbtiQ from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import riasecQ from "@/content/questionnaires/holland_riasec.v1.0.0.json";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import type { AnswerMap, Questionnaire } from "@/lib/questionnaire-types";
import { mbtiScorerV1 } from "@/server/assessments/mbti/scoring.v1";
import { riasecScorerV1 } from "@/server/assessments/riasec/scoring.v1";
import { varkScorerV1 } from "@/server/assessments/vark/scoring.v1";

// Runs every fixture file in tests/fixtures/golden — engineering fixtures today,
// client-approved fixtures ("approval": "client:<ref>") as soon as they are supplied.
const dir = join(process.cwd(), "tests/fixtures/golden");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

interface Fixture {
  assessmentId: string;
  scoringVersion: string;
  approval: string;
  cases: Array<Record<string, unknown> & { name: string; expected: Record<string, unknown> }>;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

describe.each(files)("golden fixtures: %s", (file) => {
  const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture;

  it("declares its approval tier", () => {
    expect(fixture.approval === "engineering" || fixture.approval.startsWith("client:")).toBe(true);
  });

  if (fixture.assessmentId === "mbti_personality") {
    const q = mbtiQ as Questionnaire;
    it("targets the implemented scoring version", () => expect(fixture.scoringVersion).toBe(mbtiScorerV1.scoringVersion));
    it.each(fixture.cases)("$name", (c) => {
      const answers = c.answers as string;
      const responses: AnswerMap = Object.fromEntries([...answers].map((a, i) => [`mbti_q${pad(i + 1, 3)}`, a]));
      const { scores } = mbtiScorerV1.score({ questionnaire: q, responses });
      const exp = c.expected as { typeCode: string; counts: Record<string, number>; ties: string[] };
      expect(scores.typeCode).toBe(exp.typeCode);
      expect(scores.ties).toEqual(exp.ties);
      for (const d of scores.dimensions) {
        expect(d.first.count).toBe(exp.counts[d.first.letter]);
        expect(d.second.count).toBe(exp.counts[d.second.letter]);
      }
    });
  }

  if (fixture.assessmentId === "holland_riasec") {
    const q = riasecQ as Questionnaire;
    it("targets the implemented scoring version", () => expect(fixture.scoringVersion).toBe(riasecScorerV1.scoringVersion));
    it.each(fixture.cases)("$name", (c) => {
      const ticks = c.ticks as Record<string, number[]>;
      const responses: AnswerMap = {};
      for (const section of q.sections) {
        const items = q.items.filter((i) => i.sectionId === section.id);
        items.forEach((item, idx) => (responses[item.id] = (ticks[section.id] ?? []).includes(idx)));
      }
      const { scores } = riasecScorerV1.score({ questionnaire: q, responses });
      const exp = c.expected as { scores: Record<string, number>; bands: Record<string, string> };
      for (const cat of scores.categories) {
        expect(cat.score).toBe(exp.scores[cat.code]);
        expect(cat.band).toBe(exp.bands[cat.code]);
      }
    });
  }

  if (fixture.assessmentId === "vark_learning_styles") {
    const q = varkQ as Questionnaire;
    it("targets the implemented scoring version", () => expect(fixture.scoringVersion).toBe(varkScorerV1.scoringVersion));
    it.each(fixture.cases)("$name", (c) => {
      const answers = c.answers as Record<string, string>;
      const responses: AnswerMap = Object.fromEntries(Object.entries(answers).map(([n, sel]) => [`vark_q${pad(Number(n), 2)}`, [...sel]]));
      const { scores } = varkScorerV1.score({ questionnaire: q, responses });
      const exp = c.expected as { counts: Record<string, number>; total: number; highest: string[] };
      expect(scores.counts).toEqual(exp.counts);
      expect(scores.totalScoredSelections).toBe(exp.total);
      expect(scores.highest).toEqual(exp.highest);
    });
  }
});

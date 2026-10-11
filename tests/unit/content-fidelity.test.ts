import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import mbtiQ from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import riasecQ from "@/content/questionnaires/holland_riasec.v1.0.0.json";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import varkKey from "@/content/scoring-keys/vark_learning_styles.v1.0.0.json";

// The app must show exactly the client-supplied text (spec FR-02). Any drift fails here.
const source = JSON.parse(readFileSync(join(process.cwd(), "docs/source/QUESTIONNAIRES_SOURCE_DATA.json"), "utf8"));
const mod = (id: string) => source.assessment_modules.find((m: { id: string }) => m.id === id);

describe("questionnaire content matches the source data byte-for-byte", () => {
  it("MBTI: 70 questions, same prompts and options in source order", () => {
    const src = mod("mbti_personality");
    expect(mbtiQ.items).toHaveLength(70);
    src.questions.forEach((q: { number: number; text: string; options: { key: string; text: string }[] }, i: number) => {
      const item = mbtiQ.items[i]!;
      expect(item.number).toBe(q.number);
      expect(item.prompt).toBe(q.text);
      expect(item.options).toEqual(q.options.map((o) => ({ key: o.key, text: o.text })));
      expect(item.responseType).toBe("single_choice");
    });
    expect(mbtiQ.instructions).toEqual(src.instructions);
  });

  it("RIASEC: 6 categories x 12 statements, same text, order and dimensions", () => {
    const src = mod("holland_riasec");
    expect(riasecQ.items).toHaveLength(72);
    let i = 0;
    for (const cat of src.categories) {
      for (const st of cat.statements) {
        const item = riasecQ.items[i++]!;
        expect(item.sectionId).toBe(cat.code);
        expect(item.prompt).toBe(st.text);
        const group = riasecQ.sections.find((s) => s.id === cat.code)!.groups.find((g) => g.id === item.groupId)!;
        expect(group.title).toBe(st.dimension);
      }
    }
  });

  it("RIASEC: the flagged 'Yourself' statement is kept verbatim and flagged for review", () => {
    const item = riasecQ.items.find((x) => x.prompt === "Yourself");
    expect(item?.reviewFlag).toBe("source_text_review_required");
  });

  it("VARK: 14 questions, same text, Q1 unscored", () => {
    const src = mod("vark_learning_styles");
    expect(varkQ.items).toHaveLength(14);
    src.questions.forEach((q: { number: number; text: string; options: { key: string; text: string }[] }, i: number) => {
      const item = varkQ.items[i]!;
      expect(item.prompt).toBe(q.text);
      expect(item.options).toEqual(q.options.map((o) => ({ key: o.key, text: o.text })));
      expect(item.scored).toBe(q.number !== 1);
    });
  });

  it("VARK: the scoring key equals the source chart", () => {
    const srcKey = mod("vark_learning_styles").scoring.answer_key as Record<string, { option: string; category: string }[]>;
    for (const [n, entries] of Object.entries(srcKey)) {
      const id = `vark_q${n.padStart(2, "0")}`;
      expect((varkKey.answerKey as Record<string, Record<string, string>>)[id]).toEqual(Object.fromEntries(entries.map((e) => [e.option, e.category])));
    }
  });

  it("public questionnaire files never contain scoring keys", () => {
    for (const q of [mbtiQ, riasecQ, varkQ]) {
      const text = JSON.stringify(q);
      expect(text).not.toMatch(/vark_category|answerKey|"category"/);
    }
  });
});

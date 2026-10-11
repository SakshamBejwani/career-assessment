// Builds the app's versioned questionnaire content from the client-supplied source data.
//
//   node scripts/generate-content.mjs
//
// Input:  docs/source/QUESTIONNAIRES_SOURCE_DATA.json   (never edited by this script)
// Output: src/content/questionnaires/<module>.v<version>.json   (public, shipped to the browser)
//         src/content/scoring-keys/<module>.v<version>.json     (server-only scoring keys)
//
// Text is copied byte-for-byte. tests/unit/content-fidelity.test.ts fails if the generated
// files and the source ever disagree. Bump QUESTIONNAIRE_VERSION when the source changes;
// never overwrite a version that attempts may already reference.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QUESTIONNAIRE_VERSION = "1.0.0";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(resolve(root, "docs/source/QUESTIONNAIRES_SOURCE_DATA.json"), "utf8"));

const pad = (n, width) => String(n).padStart(width, "0");
const moduleById = Object.fromEntries(source.assessment_modules.map((m) => [m.id, m]));

function provenance(m) {
  return {
    sourceFile: m.source_file,
    sourceTitle: m.source_title,
    sourcePages: m.source_pages,
    sourceStatus: m.status,
  };
}

function buildMbti() {
  const m = moduleById.mbti_personality;
  return {
    questionnaire: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      name: m.name,
      ...provenance(m),
      instructions: m.instructions,
      sections: [{ id: "main", title: null, groups: [{ id: "all", title: null }] }],
      items: m.questions.map((q) => ({
        id: `mbti_q${pad(q.number, 3)}`,
        number: q.number,
        sectionId: "main",
        groupId: "all",
        prompt: q.text,
        responseType: "single_choice",
        required: true,
        scored: true,
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
      })),
    },
    scoringKey: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      // Question n belongs to answer-sheet group ((n - 1) mod 7) + 1, as printed on PDF page 6.
      groups: Array.from({ length: 7 }, (_, g) => ({
        group: g + 1,
        questionIds: m.questions
          .filter((q) => (q.number - 1) % 7 === g)
          .map((q) => `mbti_q${pad(q.number, 3)}`),
      })),
      pairs: [
        { pair: "EI", first: "E", second: "I", groups: [1] },
        { pair: "SN", first: "S", second: "N", groups: [2, 3] },
        { pair: "TF", first: "T", second: "F", groups: [4, 5] },
        { pair: "JP", first: "J", second: "P", groups: [6, 7] },
      ],
      reportedTypeCodes: m.scoring.reported_type_codes,
      sourceSummary: m.scoring.source_summary,
    },
  };
}

const DIMENSION_SLUG = { "Are you": "are", "Can you": "can", "Like to": "like" };

function buildRiasec() {
  const m = moduleById.holland_riasec;
  const items = [];
  const sections = [];
  for (const category of m.categories) {
    const code = category.code.toLowerCase();
    const groups = [];
    const counters = {};
    for (const statement of category.statements) {
      const slug = DIMENSION_SLUG[statement.dimension];
      if (!slug) throw new Error(`Unknown RIASEC dimension: ${statement.dimension}`);
      counters[slug] = (counters[slug] ?? 0) + 1;
      const groupId = `${code}_${slug}`;
      if (!groups.some((g) => g.id === groupId)) groups.push({ id: groupId, title: statement.dimension });
      items.push({
        id: `riasec_${code}_${slug}_${pad(counters[slug], 2)}`,
        sectionId: category.code,
        groupId,
        prompt: statement.text,
        responseType: "boolean_checkbox",
        required: true,
        scored: true,
        ...(statement.text === "Yourself" ? { reviewFlag: "source_text_review_required" } : {}),
      });
    }
    sections.push({ id: category.code, title: `${category.name} (${category.code})`, groups });
  }
  return {
    questionnaire: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      name: m.name,
      ...provenance(m),
      instructions: m.instructions,
      sections,
      items,
    },
    scoringKey: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      categories: m.categories.map((c) => ({
        code: c.code,
        name: c.name,
        questionIds: items.filter((i) => i.sectionId === c.code).map((i) => i.id),
      })),
      perCategoryMax: m.scoring.per_category_max,
      levels: m.scoring.levels,
      note: m.scoring.note,
    },
  };
}

function buildVark() {
  const m = moduleById.vark_learning_styles;
  const answerKey = m.scoring.answer_key;
  return {
    questionnaire: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      name: m.name,
      ...provenance(m),
      instructions: m.instructions,
      sections: [{ id: "main", title: null, groups: [{ id: "all", title: null }] }],
      items: m.questions.map((q) => ({
        id: `vark_q${pad(q.number, 2)}`,
        number: q.number,
        sectionId: "main",
        groupId: "all",
        prompt: q.text,
        responseType: "multi_select",
        required: true,
        // The source chart assigns no categories to Q1; it is presented but never scored.
        scored: Boolean(answerKey[String(q.number)]),
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
      })),
    },
    scoringKey: {
      assessmentId: m.id,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      categoryNames: m.scoring.category_names,
      answerKey: Object.fromEntries(
        Object.entries(answerKey).map(([n, entries]) => [
          `vark_q${pad(Number(n), 2)}`,
          Object.fromEntries(entries.map((e) => [e.option, e.category])),
        ]),
      ),
      knownSourceGaps: m.scoring.known_source_gaps,
    },
  };
}

const outputs = { mbti_personality: buildMbti(), holland_riasec: buildRiasec(), vark_learning_styles: buildVark() };

for (const [id, { questionnaire, scoringKey }] of Object.entries(outputs)) {
  const qPath = resolve(root, `src/content/questionnaires/${id}.v${QUESTIONNAIRE_VERSION}.json`);
  const kPath = resolve(root, `src/content/scoring-keys/${id}.v${QUESTIONNAIRE_VERSION}.json`);
  mkdirSync(dirname(qPath), { recursive: true });
  mkdirSync(dirname(kPath), { recursive: true });
  writeFileSync(qPath, JSON.stringify(questionnaire, null, 2) + "\n");
  writeFileSync(kPath, JSON.stringify(scoringKey, null, 2) + "\n");
  console.log(`${id}: ${questionnaire.items.length} items -> ${qPath}`);
}

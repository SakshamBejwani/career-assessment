import type { InterpretationPack, VarkInterpretation } from "./types";

// DRAFT interpretation pack written by engineering for client review.
// The source PDF references follow-up information sheets that were not supplied.
// Replace or approve before production (spec §10.3).
export const varkInterpretationDraft: InterpretationPack<VarkInterpretation> = {
  assessmentId: "vark_learning_styles",
  version: "0.1.0-draft",
  status: "draft",
  content: {
    intro:
      "Each answer you chose counts towards one of four ways of taking in information. Higher counts show the modes you reached for most often. Many people use more than one.",
    modes: {
      V: {
        name: "Visual",
        description: "You may prefer information shown as diagrams, charts, maps, symbols and layouts on the page.",
        strategies: ["Turn notes into diagrams, flowcharts or mind maps", "Use colour and spacing to group ideas", "Redraw a topic from memory as a picture"],
      },
      A: {
        name: "Aural",
        description: "You may prefer hearing and talking things through: explanations, discussions and questions.",
        strategies: ["Explain a topic out loud, to yourself or a friend", "Join study groups and discussions", "Record key points and listen back"],
      },
      R: {
        name: "Read/Write",
        description: "You may prefer words on the page: reading, notes, lists and written explanations.",
        strategies: ["Rewrite notes in your own words", "Turn diagrams into written statements", "Practise with written answers and lists of key terms"],
      },
      K: {
        name: "Kinesthetic",
        description: "You may prefer learning by doing: examples, practice, demonstrations and real situations.",
        strategies: ["Use real examples and case studies", "Practise with past papers and exercises", "Learn in short, active sessions with breaks"],
      },
    },
    severalHighest:
      "More than one mode shares your highest count, so you may switch between them depending on the subject or task.",
    note: "These describe preferences, not abilities. Use them to choose study methods, and keep using what already works for you.",
  },
};

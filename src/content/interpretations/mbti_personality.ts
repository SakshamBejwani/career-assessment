import type { InterpretationPack, MbtiInterpretation } from "./types";

// DRAFT interpretation pack written by engineering for client review.
// Not supplied by the source workbook. Replace or approve before production (spec §10.3).
// Deliberately contains no type-to-career mapping (source data note, spec §21).
export const mbtiInterpretationDraft: InterpretationPack<MbtiInterpretation> = {
  assessmentId: "mbti_personality",
  version: "0.1.0-draft",
  status: "draft",
  content: {
    intro:
      "Each letter shows which side of a pair you chose more often. These are preferences, not abilities or limits: everyone uses both sides of every pair, and the counts show how strongly your answers leaned one way.",
    pairNames: {
      EI: "Where you focus your energy",
      SN: "How you take in information",
      TF: "How you make decisions",
      JP: "How you approach the outside world",
    },
    poles: {
      E: {
        name: "Extraversion",
        description:
          "You tend to draw energy from people and activity. You may think out loud, enjoy meeting new people and prefer to be where things are happening.",
      },
      I: {
        name: "Introversion",
        description:
          "You tend to recharge through quiet time and reflection. You may prefer a few close connections, think before you speak and focus deeply on one thing at a time.",
      },
      S: {
        name: "Sensing",
        description:
          "You tend to trust facts, experience and practical detail. You may like clear steps, real examples and seeing how something works before moving on.",
      },
      N: {
        name: "Intuition",
        description:
          "You tend to notice patterns, possibilities and meanings. You may enjoy ideas and imagination and find yourself asking what could be rather than what is.",
      },
      T: {
        name: "Thinking",
        description:
          "You tend to decide by weighing logic, consistency and fairness of principle. You may value clear reasons and stepping back to look at a choice objectively.",
      },
      F: {
        name: "Feeling",
        description:
          "You tend to decide by weighing values, relationships and the effect on people. You may value harmony and consider how a choice will feel to those involved.",
      },
      J: {
        name: "Judging",
        description:
          "You tend to prefer plans, structure and things being settled. You may like knowing what comes next, finishing tasks early and working to a schedule.",
      },
      P: {
        name: "Perceiving",
        description:
          "You tend to prefer flexibility and keeping options open. You may enjoy adapting as things unfold, working in bursts and deciding closer to the moment.",
      },
    },
    balanced:
      "Your answers were split evenly on this pair, so neither side stands out. That is a valid result: you may move between both depending on the situation.",
    usingThisResult: [
      "Notice the settings where you feel most energised and most drained, and compare them with your first letter.",
      "When studying or working in a group, share your preferences so others know how you like to plan and decide.",
      "Treat close counts as a sign that you use both sides comfortably.",
      "Talk through your result with a counsellor before using it in any decision about subjects or careers.",
    ],
  },
};

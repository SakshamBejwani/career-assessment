import type { InterpretationPack, RiasecInterpretation } from "./types";

// DRAFT interpretation pack written by engineering for client review.
// The source PDF supplies only category names and the High/Mid/Low bands.
// Replace or approve before production (spec §10.3).
export const riasecInterpretationDraft: InterpretationPack<RiasecInterpretation> = {
  assessmentId: "holland_riasec",
  version: "0.1.0-draft",
  status: "draft",
  content: {
    intro:
      "Holland's theory groups work interests into six areas. Your score in each area is the number of statements you ticked, out of 12. Most people have two or three areas that stand out.",
    categories: {
      R: {
        name: "Realistic",
        shortLabel: "Doing",
        description: "Practical, hands-on activity: working with tools, machines, materials, plants or animals, often outdoors.",
        enjoys: ["Building and fixing things", "Physical and outdoor activity", "Seeing a tangible result"],
        fieldsToExplore: ["Engineering technology", "Mechanics and repair", "Construction", "Agriculture and forestry", "Sports and fitness", "Aviation"],
      },
      I: {
        name: "Investigative",
        shortLabel: "Thinking",
        description: "Observing, researching and solving problems with ideas, evidence and data.",
        enjoys: ["Asking why and how", "Experiments and analysis", "Working independently on hard problems"],
        fieldsToExplore: ["Science and research", "Medicine and health sciences", "Computer and data science", "Mathematics and statistics", "Engineering"],
      },
      A: {
        name: "Artistic",
        shortLabel: "Creating",
        description: "Expressing ideas through art, design, music, writing or performance, usually in open, unstructured settings.",
        enjoys: ["Imagining new things", "Making and designing", "Freedom to work in your own way"],
        fieldsToExplore: ["Design", "Fine and performing arts", "Music", "Writing and journalism", "Film and media", "Architecture"],
      },
      S: {
        name: "Social",
        shortLabel: "Helping",
        description: "Teaching, guiding, caring for and working closely with people.",
        enjoys: ["Helping others learn or feel better", "Teamwork and cooperation", "Conversations and meetings"],
        fieldsToExplore: ["Teaching and education", "Counselling and psychology", "Nursing and healthcare", "Social work", "Human resources"],
      },
      E: {
        name: "Enterprising",
        shortLabel: "Persuading",
        description: "Leading, persuading, organising and starting things, often with some risk and competition.",
        enjoys: ["Making decisions", "Convincing and leading others", "Starting projects and events"],
        fieldsToExplore: ["Business and management", "Entrepreneurship", "Sales and marketing", "Law", "Public administration", "Event management"],
      },
      C: {
        name: "Conventional",
        shortLabel: "Organising",
        description: "Orderly work with information, numbers and procedures, where accuracy matters.",
        enjoys: ["Keeping things organised", "Working with numbers and records", "Clear instructions and standards"],
        fieldsToExplore: ["Accounting and finance", "Banking", "Administration", "Data management", "Logistics", "Quality assurance"],
      },
    },
    bands: {
      High: "This area stands out. Activities like these are likely to hold your interest.",
      Mid: "Some interest here. Worth exploring alongside your stronger areas.",
      Low: "Fewer ticks here. Most people have a few areas that appeal less.",
    },
    careerNote:
      "These fields are starting points for exploration, not recommendations. Interest is one input alongside your abilities, values, subjects and circumstances. Discuss them with a counsellor before making decisions.",
  },
};

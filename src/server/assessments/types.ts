import type { AnswerMap, Questionnaire } from "@/lib/questionnaire-types";

export class ScoringError extends Error {
  constructor(
    public readonly code: "invalid_responses" | "incomplete_responses" | "unknown_question" | "key_mismatch",
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ScoringError";
  }
}

export interface ScoringOutput<TScores> {
  scoringVersion: string;
  scores: TScores;
  warnings: string[];
}

export interface Scorer<TScores> {
  scoringVersion: string;
  score(input: { questionnaire: Questionnaire; responses: AnswerMap }): ScoringOutput<TScores>;
}

// ── Result shapes (persisted in results.scores; consumed by UI and PDF) ──────────

export type MbtiLetter = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
export interface MbtiDimension {
  pair: "EI" | "SN" | "TF" | "JP";
  first: { letter: MbtiLetter; count: number };
  second: { letter: MbtiLetter; count: number };
  total: number;
  /** null when the two counts are equal (reported as X). */
  preferred: MbtiLetter | null;
}
export interface MbtiScores {
  kind: "mbti";
  typeCode: string;
  dimensions: MbtiDimension[];
  groups: { group: number; a: number; b: number }[];
  ties: MbtiDimension["pair"][];
}

export type RiasecCode = "R" | "I" | "A" | "S" | "E" | "C";
export type RiasecBand = "High" | "Mid" | "Low";
export interface RiasecCategoryScore {
  code: RiasecCode;
  name: string;
  score: number;
  max: number;
  band: RiasecBand;
  rank: number;
}
export interface RiasecScores {
  kind: "riasec";
  categories: RiasecCategoryScore[];
  /** Category codes ordered by score, highest first (ties keep R-I-A-S-E-C order and share a rank). */
  ranking: RiasecCode[];
  topCodes: RiasecCode[];
}

export type VarkCode = "V" | "A" | "R" | "K";
export interface VarkScores {
  kind: "vark";
  counts: Record<VarkCode, number>;
  names: Record<VarkCode, string>;
  totalScoredSelections: number;
  highest: VarkCode[];
  unscoredItems: string[];
}

export type AnyScores = MbtiScores | RiasecScores | VarkScores;

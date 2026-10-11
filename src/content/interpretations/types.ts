export interface InterpretationPack<TContent> {
  assessmentId: string;
  version: string;
  /** "draft" packs are labelled as such in every report until the client approves them. */
  status: "draft" | "approved";
  approvalReference?: string;
  content: TContent;
}

export interface MbtiInterpretation {
  intro: string;
  poles: Record<"E" | "I" | "S" | "N" | "T" | "F" | "J" | "P", { name: string; description: string }>;
  pairNames: Record<"EI" | "SN" | "TF" | "JP", string>;
  balanced: string;
  usingThisResult: string[];
}

export interface RiasecInterpretation {
  intro: string;
  categories: Record<
    "R" | "I" | "A" | "S" | "E" | "C",
    { name: string; shortLabel: string; description: string; enjoys: string[]; fieldsToExplore: string[] }
  >;
  bands: Record<"High" | "Mid" | "Low", string>;
  careerNote: string;
}

export interface VarkInterpretation {
  intro: string;
  modes: Record<"V" | "A" | "R" | "K", { name: string; description: string; strategies: string[] }>;
  severalHighest: string;
  note: string;
}

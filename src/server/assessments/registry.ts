import "server-only";
import mbtiQuestionnaire from "@/content/questionnaires/mbti_personality.v1.0.0.json";
import riasecQuestionnaire from "@/content/questionnaires/holland_riasec.v1.0.0.json";
import varkQuestionnaire from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import { mbtiInterpretationDraft } from "@/content/interpretations/mbti_personality";
import { riasecInterpretationDraft } from "@/content/interpretations/holland_riasec";
import { varkInterpretationDraft } from "@/content/interpretations/vark_learning_styles";
import type { InterpretationPack } from "@/content/interpretations/types";
import type { AssessmentId } from "@/lib/assessment-ids";
import type { Questionnaire } from "@/lib/questionnaire-types";
import { getConfig, type PaymentWorkflow } from "../config";
import { mbtiScorerV1 } from "./mbti/scoring.v1";
import { riasecScorerV1 } from "./riasec/scoring.v1";
import { varkScorerV1 } from "./vark/scoring.v1";
import type { AnyScores, Scorer } from "./types";

export const REPORT_TEMPLATE_VERSION = "report-template-1.0.0";

export interface Approval {
  status: "pending" | "approved";
  /** Client sign-off reference, e.g. "ISCHS-2026-11-04-email". Required when approved. */
  reference?: string;
  approvedAt?: string;
}

export interface AssessmentVersion {
  version: string;
  questionnaire: Questionnaire;
  scorer: Scorer<AnyScores>;
  interpretation: InterpretationPack<unknown>;
  reportTemplateVersion: string;
  /** Covers questionnaire text + scoring method of this version. */
  approval: Approval;
  allowBackNavigation: boolean;
}

export interface AssessmentDefinition {
  id: AssessmentId;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  estimatedMinutes: number;
  unitLabel: string;
  activeVersion: string;
  versions: Record<string, AssessmentVersion>;
}

const PENDING: Approval = { status: "pending" };

export const ASSESSMENTS: Record<AssessmentId, AssessmentDefinition> = {
  mbti_personality: {
    id: "mbti_personality",
    name: mbtiQuestionnaire.name,
    shortName: "Personality type",
    tagline: "How you gather energy, take in information, decide and plan.",
    description:
      "70 quick either-or questions about everyday situations. Your answers place you on four preference pairs and give a four-letter type.",
    estimatedMinutes: 15,
    unitLabel: "questions",
    activeVersion: "1.0.0",
    versions: {
      "1.0.0": {
        version: "1.0.0",
        questionnaire: mbtiQuestionnaire as Questionnaire,
        scorer: mbtiScorerV1 as Scorer<AnyScores>,
        interpretation: mbtiInterpretationDraft,
        reportTemplateVersion: REPORT_TEMPLATE_VERSION,
        approval: PENDING,
        allowBackNavigation: true,
      },
    },
  },
  holland_riasec: {
    id: "holland_riasec",
    name: riasecQuestionnaire.name,
    shortName: "Career interests",
    tagline: "Which kinds of work activity appeal to you most.",
    description:
      "72 short statements across six interest areas. Tick the ones that describe you to see which areas stand out.",
    estimatedMinutes: 10,
    unitLabel: "statements",
    activeVersion: "1.0.0",
    versions: {
      "1.0.0": {
        version: "1.0.0",
        questionnaire: riasecQuestionnaire as Questionnaire,
        scorer: riasecScorerV1 as Scorer<AnyScores>,
        interpretation: riasecInterpretationDraft,
        reportTemplateVersion: REPORT_TEMPLATE_VERSION,
        approval: PENDING,
        allowBackNavigation: true,
      },
    },
  },
  vark_learning_styles: {
    id: "vark_learning_styles",
    name: varkQuestionnaire.name,
    shortName: "Learning style",
    tagline: "How you prefer to take in and work with new information.",
    description:
      "14 everyday scenarios. Choose every answer that fits you to see how you lean across visual, aural, read/write and hands-on learning.",
    estimatedMinutes: 5,
    unitLabel: "questions",
    activeVersion: "1.0.0",
    versions: {
      "1.0.0": {
        version: "1.0.0",
        questionnaire: varkQuestionnaire as Questionnaire,
        scorer: varkScorerV1 as Scorer<AnyScores>,
        interpretation: varkInterpretationDraft,
        reportTemplateVersion: REPORT_TEMPLATE_VERSION,
        approval: PENDING,
        allowBackNavigation: true,
      },
    },
  },
};

export function getDefinition(id: AssessmentId): AssessmentDefinition {
  return ASSESSMENTS[id];
}

/** Resolves the exact version an attempt was taken on (never the "current" one). */
export function getVersion(id: AssessmentId, version: string): AssessmentVersion {
  const v = ASSESSMENTS[id].versions[version];
  if (!v) throw new Error(`Unknown version ${version} for ${id}`);
  return v;
}

export function getActiveVersion(id: AssessmentId): AssessmentVersion {
  return getVersion(id, ASSESSMENTS[id].activeVersion);
}

export type Availability =
  | { available: true; preview: boolean }
  | { available: false; reason: "disabled" | "pending_approval" | "no_price" };

/**
 * The approval gate (spec FR-02a). Production serves only approved versions unless
 * ALLOW_UNAPPROVED_ASSESSMENTS=true, in which case the module is served as a labelled preview.
 */
export function availability(id: AssessmentId): Availability {
  const config = getConfig();
  if (!config.assessments.enabled.includes(id)) return { available: false, reason: "disabled" };
  if (config.assessments.prices[id] === undefined) return { available: false, reason: "no_price" };
  if (isFullyApproved(getActiveVersion(id))) return { available: true, preview: false };
  if (config.isProduction && !config.assessments.allowUnapproved) return { available: false, reason: "pending_approval" };
  return { available: true, preview: true };
}

/** Questionnaire + scoring signed off with a reference, and the interpretation pack approved. */
export function isFullyApproved(v: AssessmentVersion): boolean {
  return v.approval.status === "approved" && Boolean(v.approval.reference) && v.interpretation.status === "approved";
}

export interface PublicAssessmentSummary {
  id: AssessmentId;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  estimatedMinutes: number;
  itemCount: number;
  unitLabel: string;
  price: number | null;
  currency: string;
  paymentWorkflow: PaymentWorkflow;
  available: boolean;
  preview: boolean;
  unavailableReason?: string;
}

export function publicSummary(id: AssessmentId): PublicAssessmentSummary {
  const config = getConfig();
  const def = getDefinition(id);
  const v = getActiveVersion(id);
  const a = availability(id);
  return {
    id,
    name: def.name,
    shortName: def.shortName,
    tagline: def.tagline,
    description: def.description,
    estimatedMinutes: def.estimatedMinutes,
    itemCount: v.questionnaire.items.length,
    unitLabel: def.unitLabel,
    price: config.assessments.prices[id] ?? null,
    currency: config.payments.currency,
    paymentWorkflow: config.assessments.workflows[id],
    available: a.available,
    preview: a.available ? a.preview : false,
    ...(a.available ? {} : { unavailableReason: a.reason }),
  };
}

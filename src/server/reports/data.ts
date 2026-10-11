import "server-only";
import type { Attempt, Result } from "@/generated/prisma/client";
import type { AssessmentId } from "@/lib/assessment-ids";
import { getConfig } from "../config";
import { getDefinition, getVersion, isFullyApproved } from "../assessments/registry";
import type { AnyScores } from "../assessments/types";

export interface ReportData {
  reference: string;
  studentName: string;
  orgName: string;
  timezone: string;
  preview: boolean;
  assessment: { id: AssessmentId; name: string; shortName: string; sourceTitle: string; sourceFile: string };
  provenance: {
    assessmentVersion: string;
    questionnaireVersion: string;
    scoringVersion: string;
    templateVersion: string;
    interpretationVersion: string;
    interpretationStatus: "draft" | "approved";
    approvalStatus: "pending" | "approved";
    approvalReference?: string;
    scoredAt: Date;
  };
  scores: AnyScores;
  interpretation: unknown;
  warnings: string[];
}

/**
 * Builds everything the template needs from stored records only. Scores come from the
 * persisted result snapshot; nothing is recalculated here (spec §10.2).
 */
export function buildReportData(attempt: Attempt, result: Result): ReportData {
  const id = attempt.assessmentId as AssessmentId;
  const def = getDefinition(id);
  const version = getVersion(id, attempt.assessmentVersion);
  const config = getConfig();
  return {
    reference: attempt.publicRef,
    studentName: attempt.contactName,
    orgName: config.orgName,
    timezone: config.displayTimezone,
    preview: attempt.approvalState !== "approved" || !isFullyApproved(version),
    assessment: {
      id,
      name: def.name,
      shortName: def.shortName,
      sourceTitle: version.questionnaire.sourceTitle,
      sourceFile: version.questionnaire.sourceFile,
    },
    provenance: {
      assessmentVersion: attempt.assessmentVersion,
      questionnaireVersion: attempt.questionnaireVersion,
      scoringVersion: result.scoringVersion,
      templateVersion: attempt.reportTemplateVersion,
      interpretationVersion: version.interpretation.version,
      interpretationStatus: version.interpretation.status,
      approvalStatus: version.approval.status,
      approvalReference: version.approval.reference,
      scoredAt: result.scoredAt,
    },
    scores: result.scores as unknown as AnyScores,
    interpretation: version.interpretation.content,
    warnings: (result.warnings as string[] | null) ?? [],
  };
}

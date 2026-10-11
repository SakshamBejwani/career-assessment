import { isAssessmentId } from "@/lib/assessment-ids";
import { getActiveVersion, publicSummary } from "@/server/assessments/registry";
import { Errors } from "@/server/errors";
import { apiHandler, json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Questionnaire content for display. Scoring keys are never included. */
export const GET = apiHandler<{ id: string }>(async ({ params }) => {
  if (!isAssessmentId(params.id)) throw Errors.notFound("Assessment");
  const summary = publicSummary(params.id);
  if (!summary.available) throw Errors.notFound("Assessment");
  const { questionnaire, allowBackNavigation } = getActiveVersion(params.id);
  return json({ ...summary, allowBackNavigation, questionnaire });
});

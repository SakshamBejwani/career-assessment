import type { Metadata } from "next";
import { AttemptClient } from "@/components/attempt/AttemptClient";
import { AccessProblem } from "@/components/site/AccessProblem";
import { AttemptHeader } from "@/components/site/AttemptHeader";
import type { AssessmentId } from "@/lib/assessment-ids";
import { getVersion } from "@/server/assessments/registry";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { attemptView, getAuthorisedAttempt } from "@/server/workflow/attempts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your assessment", robots: { index: false } };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let attempt;
  try {
    attempt = await getAuthorisedAttempt(id);
  } catch (error) {
    if (error instanceof AppError) return <AccessProblem />;
    throw error;
  }
  const view = await attemptView(attempt);
  const { questionnaire } = getVersion(attempt.assessmentId as AssessmentId, attempt.assessmentVersion);
  return (
    <>
      <AttemptHeader
        title={view.assessment.shortName}
        width={view.status === "in_progress" && questionnaire.items[0]?.responseType === "boolean_checkbox" ? "medium" : "narrow"}
      />
      <main id="main">
        <AttemptClient initial={view} questionnaire={questionnaire} supportEmail={getConfig().supportEmail} />
      </main>
    </>
  );
}

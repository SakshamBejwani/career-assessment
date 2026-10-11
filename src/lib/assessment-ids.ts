export const ASSESSMENT_IDS = ["mbti_personality", "holland_riasec", "vark_learning_styles"] as const;
export type AssessmentId = (typeof ASSESSMENT_IDS)[number];

export function isAssessmentId(value: string): value is AssessmentId {
  return (ASSESSMENT_IDS as readonly string[]).includes(value);
}

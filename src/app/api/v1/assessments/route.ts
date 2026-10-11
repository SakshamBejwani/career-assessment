import { ASSESSMENT_IDS } from "@/lib/assessment-ids";
import { publicSummary } from "@/server/assessments/registry";
import { apiHandler, json } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => json({ assessments: ASSESSMENT_IDS.map(publicSummary) }));

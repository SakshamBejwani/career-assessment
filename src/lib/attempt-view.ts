import type { AssessmentId } from "./assessment-ids";
import type { AnswerMap } from "./questionnaire-types";
import type { AttemptStatus } from "./status";

/** What the attempt owner's browser receives about their attempt. */
export interface AttemptView {
  id: string;
  reference: string;
  assessment: { id: AssessmentId; name: string; shortName: string };
  status: AttemptStatus;
  statusLabel: string;
  paymentWorkflow: "upfront" | "post_completion";
  price: number;
  currency: string;
  paid: boolean;
  payable: boolean;
  preview: boolean;
  allowBackNavigation: boolean;
  answers: AnswerMap | null;
  report: { id: string; ready: boolean; unlocked: boolean } | null;
  deliveries: { channel: string; status: string; purpose: string | null }[];
  contact: { email: string; whatsapp: string | null; whatsappOptIn: boolean };
  failed: boolean;
  submittedAt: string | null;
  paymentProvider: "razorpay" | "mock";
}

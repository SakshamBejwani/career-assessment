// Attempt/payment/job status vocabularies shared by server and UI.

export const ATTEMPT_STATUSES = [
  "awaiting_payment",
  "in_progress",
  "submitted",
  "scoring",
  "scored",
  "report_generating",
  "report_ready_locked",
  "report_unlocked",
  "completed",
  "cancelled",
  "failed",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "cancelled", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const JOB_STATUSES = ["pending", "running", "succeeded", "failed", "dead"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = ["score_attempt", "generate_report", "deliver_email", "deliver_whatsapp", "notify_owner"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** States after submission in which a post-completion payment may be taken. */
export const POST_SUBMIT_PAYABLE: readonly AttemptStatus[] = [
  "submitted",
  "scoring",
  "scored",
  "report_generating",
  "report_ready_locked",
];

/** Plain-language labels for students. */
export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  awaiting_payment: "Payment needed to start",
  in_progress: "In progress",
  submitted: "Answers submitted",
  scoring: "Scoring your answers",
  scored: "Answers scored",
  report_generating: "Preparing your report",
  report_ready_locked: "Report ready, payment needed",
  report_unlocked: "Report ready",
  completed: "Report delivered",
  cancelled: "Cancelled",
  failed: "Needs attention",
};

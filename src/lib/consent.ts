// Consent wording shown on the start form and stored (by version) with each attempt.
// Changing any text here requires a new CONSENT_TEXT_VERSION.
export const CONSENT_TEXT_VERSION = "consent-2026-10-v1";

export const CONSENT_TEXT = {
  data_processing:
    "I agree that my answers, results and contact details are stored and used to score this assessment, prepare my report and send it to me, as described in the privacy notice.",
  age_or_guardian: "I am 18 or older, or my parent or guardian has agreed to me taking this assessment.",
  email_delivery: "Send my report to the email address above.",
  whatsapp_delivery: "Also send me a WhatsApp message with a secure link to my report.",
} as const;

export type ConsentPurpose = keyof typeof CONSENT_TEXT;

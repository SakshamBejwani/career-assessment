"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { AssessmentId } from "@/lib/assessment-ids";
import type { CONSENT_TEXT } from "@/lib/consent";

type FieldErrors = Partial<Record<"fullName" | "email" | "whatsapp" | "dataProcessing" | "ageOrGuardian", string>>;

export function StartForm({
  assessmentId,
  upfront,
  consentText,
  defaultRegion,
  whatsappEnabled,
}: {
  assessmentId: AssessmentId;
  upfront: boolean;
  consentText: typeof CONSENT_TEXT;
  defaultRegion: string;
  whatsappEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      fullName: String(form.get("fullName") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      whatsapp: String(form.get("whatsapp") ?? "").trim(),
      dataProcessing: form.get("dataProcessing") === "on",
      ageOrGuardian: form.get("ageOrGuardian") === "on",
      whatsappOptIn: form.get("whatsappOptIn") === "on",
    };
    const next: FieldErrors = {};
    if (values.fullName.length < 2) next.fullName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = "Enter an email address like name@example.com.";
    if (!values.dataProcessing) next.dataProcessing = "Tick this box to continue.";
    if (!values.ageOrGuardian) next.ageOrGuardian = "Tick this box to continue.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      document.getElementById(`field-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ attemptId: string }>("/api/v1/attempts", {
        body: {
          assessmentId,
          fullName: values.fullName,
          email: values.email,
          whatsapp: values.whatsapp,
          consents: { dataProcessing: true, ageOrGuardian: true, whatsapp: values.whatsappOptIn },
        },
      });
      router.push(`/attempt/${res.attemptId}`);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError) {
        const fields = (error.body.details?.fields as { path: string; message: string }[] | undefined) ?? [];
        const fieldErrors: FieldErrors = {};
        for (const f of fields) {
          const key = f.path.split(".").pop() as keyof FieldErrors;
          if (key === "whatsapp") fieldErrors.whatsapp = error.body.message;
          else if (key) fieldErrors[key] = f.message;
        }
        if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
        else setFormError(`${error.body.message}${error.body.reference ? ` (Reference ${error.body.reference.slice(0, 8)})` : ""}`);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  }

  const describedBy = (name: keyof FieldErrors, hint?: string) =>
    [errors[name] ? `error-${name}` : null, hint].filter(Boolean).join(" ") || undefined;

  return (
    <form className="mt-6 space-y-5" onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="field-fullName" className="field-label">
          Full name
        </label>
        <input id="field-fullName" name="fullName" autoComplete="name" className="field-input" aria-invalid={Boolean(errors.fullName)} aria-describedby={describedBy("fullName")} />
        {errors.fullName ? (
          <p id="error-fullName" className="field-error">
            {errors.fullName}
          </p>
        ) : null}
        <p className="field-hint mt-1">This appears on your report.</p>
      </div>
      <div>
        <label htmlFor="field-email" className="field-label">
          Email
        </label>
        <input id="field-email" name="email" type="email" autoComplete="email" inputMode="email" className="field-input" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email")} />
        {errors.email ? (
          <p id="error-email" className="field-error">
            {errors.email}
          </p>
        ) : null}
      </div>
      {whatsappEnabled ? (
        <div>
          <label htmlFor="field-whatsapp" className="field-label">
            WhatsApp number <span className="font-light text-slate">(optional)</span>
          </label>
          <input
            id="field-whatsapp"
            name="whatsapp"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className="field-input"
            placeholder={defaultRegion === "IN" ? "98765 43210" : "+1 555 123 4567"}
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            aria-invalid={Boolean(errors.whatsapp)}
            aria-describedby={describedBy("whatsapp", "hint-whatsapp")}
          />
          {errors.whatsapp ? (
            <p id="error-whatsapp" className="field-error">
              {errors.whatsapp}
            </p>
          ) : null}
          <p id="hint-whatsapp" className="field-hint mt-1">
            {defaultRegion === "IN" ? "Indian numbers don't need +91. Add the country code for other countries." : "Include the country code."}
          </p>
        </div>
      ) : null}

      <fieldset className="space-y-3 border-t border-rule pt-5">
        <legend className="sr-only">Agreements</legend>
        <Check id="field-dataProcessing" name="dataProcessing" error={errors.dataProcessing}>
          {consentText.data_processing}{" "}
          <Link href="/privacy" target="_blank" className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
            Read the privacy notice
          </Link>
        </Check>
        <Check id="field-ageOrGuardian" name="ageOrGuardian" error={errors.ageOrGuardian}>
          {consentText.age_or_guardian}
        </Check>
        {whatsappEnabled ? (
          <Check id="field-whatsappOptIn" name="whatsappOptIn" disabled={whatsapp.trim() === ""}>
            {consentText.whatsapp_delivery}
          </Check>
        ) : null}
      </fieldset>

      {formError ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-alert-soft px-4 py-3 text-sm text-alert">
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Starting…" : upfront ? "Continue to payment" : "Start the questionnaire"}
      </button>
    </form>
  );
}

function Check({ id, name, error, disabled, children }: { id: string; name: string; error?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={`flex gap-3 text-[0.95rem] leading-snug ${disabled ? "text-muted" : "text-ink"}`}>
        <input
          id={id}
          name={name}
          type="checkbox"
          disabled={disabled}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="field-error ml-8">
          {error}
        </p>
      ) : null}
    </div>
  );
}

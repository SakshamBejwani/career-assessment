"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";

interface CheckoutSession {
  provider: "razorpay" | "mock";
  orderId: string;
  keyId: string | null;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment window"));
    document.head.appendChild(script);
  });
}

/**
 * Starts payment. Whatever the browser reports, the server decides whether payment succeeded
 * (signature + order check, or the provider webhook); this panel only shows progress.
 */
export function PaymentPanel({
  attemptId,
  price,
  currency,
  provider,
  heading,
  body,
  onChanged,
}: {
  attemptId: string;
  price: number;
  currency: string;
  provider: "razorpay" | "mock";
  heading: string;
  body: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const amount = formatMoney(price, currency);

  async function payWithRazorpay() {
    setBusy(true);
    setMessage(null);
    try {
      const session = await api<CheckoutSession>(`/api/v1/attempts/${attemptId}/payment-session`, { body: {} });
      await loadRazorpay();
      const checkout = new window.Razorpay!({
        key: session.keyId,
        order_id: session.orderId,
        amount: session.amount,
        currency: session.currency,
        name: session.name,
        description: session.description,
        prefill: session.prefill,
        theme: { color: "#17213A" },
        handler: async (response: RazorpayResponse) => {
          setMessage({ tone: "info", text: "Confirming your payment…" });
          try {
            const result = await api<{ status: "succeeded" | "pending" }>(`/api/v1/attempts/${attemptId}/payment-confirmation`, { body: response });
            setMessage(
              result.status === "succeeded"
                ? { tone: "info", text: "Payment confirmed." }
                : { tone: "info", text: "Payment received. We're waiting for the bank to confirm it; this usually takes under a minute." },
            );
          } catch (error) {
            setMessage({ tone: "error", text: error instanceof ApiError ? error.body.message : "We couldn't confirm the payment yet." });
          } finally {
            setBusy(false);
            onChanged();
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage({ tone: "info", text: "Payment window closed. You haven't been charged." });
          },
        },
      });
      checkout.on("payment.failed", () => {
        setMessage({ tone: "error", text: "The payment didn't go through. You can try again or use another method." });
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage({ tone: "error", text: error instanceof ApiError ? error.body.message : "We couldn't open the payment window. Try again." });
    }
  }

  async function simulate(outcome: "succeeded" | "failed") {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/v1/attempts/${attemptId}/payment-mock`, { body: { outcome } });
      setMessage(outcome === "succeeded" ? { tone: "info", text: "Test payment recorded." } : { tone: "error", text: "Test payment failed. Try again." });
      onChanged();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.body.message : "Test payment could not be recorded." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-plate)] border border-rule bg-paper p-6 sm:p-8" aria-labelledby="pay-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="pay-heading" className="text-xl sm:text-2xl">
          {heading}
        </h2>
        <p className="font-display text-2xl font-semibold">{amount}</p>
      </div>
      <p className="mt-3 max-w-[56ch] text-slate">{body}</p>

      {provider === "razorpay" ? (
        <div className="mt-6">
          <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={payWithRazorpay} disabled={busy}>
            {busy ? "Opening payment…" : `Pay ${amount}`}
          </button>
          <p className="mt-3 text-sm text-muted">Secure payment by Razorpay: UPI, cards, net banking and wallets.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--radius-control)] border border-dashed border-rule-strong p-4">
          <p className="text-sm font-medium">Test mode</p>
          <p className="mt-1 text-sm text-slate">Payments are simulated on this environment. No money moves.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => simulate("succeeded")} disabled={busy}>
              Simulate successful payment
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => simulate("failed")} disabled={busy}>
              Simulate failed payment
            </button>
          </div>
        </div>
      )}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-5 rounded-[var(--radius-control)] px-4 py-3 text-sm ${message.tone === "error" ? "bg-alert-soft text-alert" : "bg-mist text-ink"}`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

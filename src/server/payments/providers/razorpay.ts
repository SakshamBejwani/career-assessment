import "server-only";
import { hmacHex, safeEqual, sha256Hex } from "../../security/crypto";
import { PaymentProviderError, type CreateOrderInput, type OrderStatus, type PaymentProvider, type WebhookOutcome } from "../types";

const API = "https://api.razorpay.com/v1";

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

interface RzpPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  error_description?: string | null;
  error_reason?: string | null;
}

export function createRazorpayProvider(cfg: RazorpayConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const auth = "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: { authorization: auth, "content-type": "application/json", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new PaymentProviderError("provider_unreachable", "Could not reach Razorpay", true);
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      let code = `razorpay_http_${res.status}`;
      try {
        const body = (await res.json()) as { error?: { code?: string } };
        if (body.error?.code) code = `razorpay_${body.error.code}`.toLowerCase();
      } catch {
        /* non-JSON error body */
      }
      throw new PaymentProviderError(code, `Razorpay request failed (${res.status})`, retryable);
    }
    return (await res.json()) as T;
  }

  return {
    name: "razorpay",

    async createOrder(input: CreateOrderInput) {
      const order = await call<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes }),
      });
      return { orderId: order.id };
    },

    publicKey: () => cfg.keyId,

    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      return safeEqual(hmacHex(cfg.keySecret, `${orderId}|${paymentId}`), signature);
    },

    async fetchOrderStatus(orderId: string): Promise<OrderStatus> {
      const order = await call<{ status: string; amount_paid: number; currency: string }>(`/orders/${encodeURIComponent(orderId)}`);
      let paymentId: string | undefined;
      if (order.status === "paid") {
        const payments = await call<{ items: RzpPayment[] }>(`/orders/${encodeURIComponent(orderId)}/payments`);
        paymentId = payments.items.find((p) => p.status === "captured")?.id;
      }
      return { paid: order.status === "paid", amountPaid: order.amount_paid, currency: order.currency, paymentId };
    },

    parseWebhook(rawBody: string, headers: Headers): WebhookOutcome {
      if (!cfg.webhookSecret) throw new PaymentProviderError("webhook_not_configured", "RAZORPAY_WEBHOOK_SECRET is not set");
      const signature = headers.get("x-razorpay-signature") ?? "";
      if (!signature || !safeEqual(hmacHex(cfg.webhookSecret, rawBody), signature)) {
        throw new PaymentProviderError("invalid_signature", "Webhook signature mismatch");
      }
      const event = JSON.parse(rawBody) as {
        event: string;
        payload?: { payment?: { entity: RzpPayment }; order?: { entity: { id: string; amount_paid: number; currency: string } } };
      };
      // Razorpay sends a unique id per event; fall back to a body hash for replays without it.
      const eventId = headers.get("x-razorpay-event-id") ?? `sha256:${sha256Hex(rawBody)}`;
      const payment = event.payload?.payment?.entity;
      if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id && payment.status === "captured") {
        return {
          kind: "payment_succeeded",
          eventId,
          eventType: event.event,
          orderId: payment.order_id,
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
        };
      }
      if (event.event === "payment.failed" && payment?.order_id) {
        return {
          kind: "payment_failed",
          eventId,
          eventType: event.event,
          orderId: payment.order_id,
          paymentId: payment.id,
          reason: (payment.error_reason ?? payment.error_description ?? "payment_failed").slice(0, 200),
        };
      }
      return { kind: "ignored", eventId, eventType: event.event };
    },
  };
}

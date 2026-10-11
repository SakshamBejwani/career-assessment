export interface CreateOrderInput {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}

export interface OrderStatus {
  paid: boolean;
  amountPaid: number;
  currency: string;
  /** A captured payment on this order, when one exists. */
  paymentId?: string;
}

export type WebhookOutcome =
  | { kind: "payment_succeeded"; eventId: string; eventType: string; orderId: string; paymentId: string; amount: number; currency: string }
  | { kind: "payment_failed"; eventId: string; eventType: string; orderId: string; paymentId?: string; reason: string }
  | { kind: "ignored"; eventId: string; eventType: string };

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly name: "razorpay" | "mock";
  createOrder(input: CreateOrderInput): Promise<{ orderId: string }>;
  /** Public values the browser needs to open checkout (never secrets). */
  publicKey(): string | null;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  fetchOrderStatus(orderId: string): Promise<OrderStatus>;
  /** Throws PaymentProviderError("invalid_signature") if the payload is not authentic. */
  parseWebhook(rawBody: string, headers: Headers): WebhookOutcome;
}

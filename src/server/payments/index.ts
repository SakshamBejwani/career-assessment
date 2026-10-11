import "server-only";
import { getConfig } from "../config";
import { createMockProvider } from "./providers/mock";
import { createRazorpayProvider } from "./providers/razorpay";
import type { PaymentProvider } from "./types";

let provider: PaymentProvider | undefined;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  const { payments, isProduction } = getConfig();
  if (payments.provider === "razorpay") {
    provider = createRazorpayProvider(payments.razorpay!);
  } else {
    if (isProduction) throw new Error("Mock payments are disabled in production");
    provider = createMockProvider();
  }
  return provider;
}

/** Test hook. */
export function setPaymentProviderForTests(p: PaymentProvider | undefined) {
  provider = p;
}

import "server-only";
import { randomToken } from "../../security/crypto";
import { PaymentProviderError, type PaymentProvider } from "../types";

/**
 * Development/test provider. Orders are local; payment outcomes are simulated through
 * POST /api/v1/attempts/{id}/payment-mock, which goes through the same domain code as
 * real payments. Config validation refuses this provider when APP_ENV=production.
 */
export function createMockProvider(): PaymentProvider {
  return {
    name: "mock",
    async createOrder() {
      return { orderId: `mock_order_${randomToken(9)}` };
    },
    publicKey: () => null,
    verifyCheckoutSignature: () => false,
    async fetchOrderStatus() {
      return { paid: false, amountPaid: 0, currency: "INR" };
    },
    parseWebhook() {
      throw new PaymentProviderError("not_supported", "The mock provider has no webhooks");
    },
  };
}

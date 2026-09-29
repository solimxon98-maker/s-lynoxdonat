import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookRequest,
  WebhookResult,
} from "./types.ts";

/**
 * MOCK to'lov provider. Pul yechilmaydi.
 * To'lov Web App ichidagi test oynasida "To'lash (test)" tugmasi bilan tasdiqlanadi
 * (POST /api/payments/:paymentId/mock — faqat MOCK_MODE=true bo'lganda ishlaydi).
 * Tashqi webhook qabul qilmaydi.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      mode: "in_app_mock",
      payUrl: `/pay/${encodeURIComponent(input.paymentId)}`,
      externalId: `MOCKPAY-${input.paymentId}`,
    };
  }

  async handleWebhook(_req: WebhookRequest): Promise<WebhookResult> {
    return {
      httpStatus: 403,
      body: { ok: false, error: "Mock provider tashqi webhook qabul qilmaydi" },
      events: [],
    };
  }
}

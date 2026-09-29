import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, WebhookRequest, WebhookResult } from "./types.ts";

/**
 * Ichki balans. Buyurtma foydalanuvchi balansidan yechiladi (pay_order_from_balance SQL funksiyasi).
 * Balans kartaga o'tkazma + admin tasdig'i bilan to'ldiriladi (topups). Tashqi webhook yo'q.
 */
export class BalancePaymentProvider implements PaymentProvider {
  readonly id = "balance";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return { mode: "balance", payUrl: `/pay/${encodeURIComponent(input.paymentId)}`, externalId: null };
  }

  async handleWebhook(_req: WebhookRequest): Promise<WebhookResult> {
    return { httpStatus: 404, body: { ok: false }, events: [] };
  }
}

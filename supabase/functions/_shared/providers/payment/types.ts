import type { PaymentStatus } from "../../types.ts";

/**
 * To'lov provider abstraksiyasi. Click / Payme / Uzum va boshqalar shu interfeysni
 * implement qiladi va registry (index.ts) ga qo'shiladi — boshqa kod o'zgarmaydi.
 */

export interface CreatePaymentInput {
  paymentId: string; // payments/{paymentId}
  orderId: string; // SLD-000001
  amount: number; // so'mda
  currency: string;
  description: string;
  returnUrl: string;
}

export interface CreatePaymentResult {
  /** "balance" — ichki balansdan; "in_app_mock" — test oynasi; "redirect" — provider sahifasiga o'tish */
  mode: "balance" | "in_app_mock" | "redirect";
  payUrl: string | null;
  externalId: string | null;
}

/** Webhook natijasida aniqlangan to'lov hodisasi */
export interface PaymentEvent {
  paymentId: string;
  status: PaymentStatus;
  externalId?: string | null;
  /** Provider xabar bergan summa (so'mda) — buyurtma summasi bilan solishtiriladi */
  amount?: number;
  raw?: Record<string, unknown>;
}

export interface WebhookRequest {
  headers: Headers;
  query: URLSearchParams;
  /** Parslangan tana (JSON yoki form) */
  body: unknown;
  /** Imzo tekshiruvi uchun xom tana */
  rawBody: string;
  ip: string | null;
}

export interface WebhookResult {
  /** Providerga qaytariladigan HTTP javob (Payme JSON-RPC kabi protokollar uchun) */
  httpStatus: number;
  body: unknown;
  /** Imzo tekshiruvidan o'tgan hodisalar */
  events: PaymentEvent[];
}

export interface PaymentProvider {
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Webhookni QABUL QILISH va IMZOSINI TEKSHIRISH shu yerda bo'ladi.
   * Imzo noto'g'ri bo'lsa events bo'sh qaytadi va httpStatus 4xx bo'ladi.
   */
  handleWebhook(req: WebhookRequest): Promise<WebhookResult>;
}

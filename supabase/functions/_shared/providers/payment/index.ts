import { config } from "../../config.ts";
import { BalancePaymentProvider } from "./BalancePaymentProvider.ts";
import { MockPaymentProvider } from "./MockPaymentProvider.ts";
import type { PaymentProvider } from "./types.ts";

export * from "./types.ts";

/**
 * To'lov providerlari ro'yxati.
 * Yangi provider qo'shish:
 *   1. providers/payment/ClickProvider.ts (yoki PaymeProvider.ts, UzumProvider.ts) faylida
 *      PaymentProvider interfeysini implement qiling (createPayment + imzo tekshiruvchi handleWebhook).
 *   2. Shu yerga qo'shing:  click: new ClickProvider(),
 *   3. functions/.env da PAYMENT_PROVIDER=click, MOCK_MODE=false
 *   4. Provider kabinetida webhook URL: https://<hosting-domain>/api/payments/webhook/click
 */
const registry: Record<string, PaymentProvider> = {
  balance: new BalancePaymentProvider(),
  mock: new MockPaymentProvider(),
};

export function getPaymentProviderById(id: string): PaymentProvider | null {
  return registry[id] ?? null;
}

/**
 * Yangi to'lov yaratishda ishlatiladigan faol provider.
 * Standart: "balance" (kartaga o'tkazma -> admin tasdig'i -> balans). "mock" faqat MOCK_MODE=true da.
 */
export function getActivePaymentProvider(): PaymentProvider {
  const id = config.payment.provider || "balance";
  if (id === "mock") {
    if (!config.mockMode) throw new Error("PAYMENT_PROVIDER=mock faqat MOCK_MODE=true bilan ishlaydi");
    return registry.mock;
  }
  const p = registry[id];
  if (!p) throw new Error(`To'lov provider "${id}" hali ulanmagan. PAYMENT_PROVIDER=balance qiling yoki providerni registry ga qo'shing.`);
  return p;
}

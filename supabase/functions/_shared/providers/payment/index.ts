import { config } from "../../config.ts";
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
  mock: new MockPaymentProvider(),
};

export function getPaymentProviderById(id: string): PaymentProvider | null {
  return registry[id] ?? null;
}

/** Yangi to'lov yaratishda ishlatiladigan faol provider */
export function getActivePaymentProvider(): PaymentProvider {
  if (config.mockMode) return registry.mock;
  const p = registry[config.payment.provider];
  if (!p || p.id === "mock") {
    throw new Error(
      `To'lov provider "${config.payment.provider}" hali ulanmagan. MOCK_MODE=true qiling yoki providerni registry ga qo'shing.`,
    );
  }
  return p;
}

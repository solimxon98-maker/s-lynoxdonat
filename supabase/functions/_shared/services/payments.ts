import { rpc } from "../db.ts";
import { esc } from "../format.ts";
import { writeLog } from "../logger.ts";
import type { PaymentEvent } from "../providers/payment/index.ts";
import { notifyAdmins } from "../telegramApi.ts";

export type ApplyResult = "applied" | "duplicate" | "ignored" | "not_found" | "amount_mismatch";

/** To'lov hodisasini idempotent qo'llaydi (apply_payment_event SQL funksiyasi) */
export async function applyPaymentEvent(event: PaymentEvent, source: string): Promise<ApplyResult> {
  const result = await rpc<ApplyResult>("apply_payment_event", {
    p_payment_id: event.paymentId,
    p_status: event.status,
    p_amount: typeof event.amount === "number" ? Math.round(event.amount) : null,
    p_external_id: event.externalId ?? null,
    p_raw: event.raw ?? null,
  });
  await writeLog(result === "applied" || result === "duplicate" ? "info" : "warn", `payment_event_${result}`, {
    paymentId: event.paymentId, status: event.status, amount: event.amount ?? null, source,
  });
  if (event.status === "PAID" && (result === "ignored" || result === "amount_mismatch")) {
    await notifyAdmins(
      `⚠️ <b>To‘lov e'tiborsiz qoldirildi</b>\n\nPayment: <code>${esc(event.paymentId)}</code>\nSabab: ${esc(result)}\nManba: ${esc(source)}\n\nIltimos, qo‘lda tekshiring.`,
    );
  }
  return result;
}

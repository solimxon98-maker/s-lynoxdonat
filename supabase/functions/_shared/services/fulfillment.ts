import { rpc } from "../db.ts";
import { writeLog } from "../logger.ts";
import { getDonateProvider, ProviderError, type ProviderOrderResult } from "../providers/donate/index.ts";
import type { Order } from "../types.ts";
import { getOrder } from "./orders.ts";
import { notifyAdminsFailure, notifyAdminsNewOrder, notifyUserFailure, notifyUserSuccess } from "./notifications.ts";

const QUICK_CHECK_DELAY_MS = 6000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * To'langan buyurtmani FastDonate ga yuboradi.
 * claim_paid_order faqat status=PAID bo'lsa PROCESSING ga o'tkazadi — ikki marta chaqirilsa ham
 * donat ikki marta ketmaydi. To'lanmagan buyurtma hech qachon providerga yuborilmaydi.
 */
export async function processPaidOrder(orderNo: string): Promise<void> {
  const claimed = await rpc<Order | null>("claim_paid_order", { p_order_no: orderNo });
  if (!claimed) return;
  await writeLog("info", "donate_processing", { orderNo, attempt: claimed.attempts });
  await notifyAdminsNewOrder(claimed);

  let result: ProviderOrderResult;
  try {
    result = await getDonateProvider().createOrder({
      externalId: claimed.order_no,
      mlbbId: claimed.mlbb_id,
      serverId: claimed.server_id,
      category: claimed.product.category ?? "diamonds",
      productName: claimed.product.name,
      diamonds: claimed.product.diamonds,
      bonus: claimed.product.bonus,
      providerSku: claimed.product.provider_sku,
    });
  } catch (e) {
    await failOrder(orderNo, e);
    return;
  }

  await rpc("set_provider_order", { p_order_no: orderNo, p_provider_order_id: result.providerOrderId });
  await writeLog("info", "donate_provider_accepted", { orderNo, providerOrderId: result.providerOrderId, status: result.status });

  if (result.status === "SUCCESS") return void (await completeOrder(orderNo));
  if (result.status === "FAILED") {
    return void (await failOrder(orderNo, new ProviderError("ORDER_FAILED", result.message ?? "Provider buyurtmani bajarmadi")));
  }
  await sleep(QUICK_CHECK_DELAY_MS);
  await checkProcessingOrder(orderNo);
}

/** PROCESSING buyurtmani providerdan tekshirish (cron ham chaqiradi) */
export async function checkProcessingOrder(orderNo: string): Promise<void> {
  const o = await getOrder(orderNo).catch(() => null);
  if (!o || o.status !== "PROCESSING" || !o.provider_order_id) return;
  try {
    const r = await getDonateProvider().checkOrder(o.provider_order_id);
    if (r.status === "SUCCESS") await completeOrder(orderNo);
    else if (r.status === "FAILED") await failOrder(orderNo, new ProviderError("ORDER_FAILED", r.message ?? "Provider buyurtmani bajarmadi"));
  } catch (e) {
    // Vaqtinchalik xato buyurtmani FAILED qilmaydi — keyingi tekshiruvda qayta uriniladi
    await writeLog("warn", "donate_check_failed", {
      orderNo, code: e instanceof ProviderError ? e.code : "UNKNOWN", message: (e as Error).message,
    });
  }
}

export async function completeOrder(orderNo: string, manualBy: string | null = null): Promise<Order | null> {
  const done = await rpc<Order | null>("complete_order", { p_order_no: orderNo, p_manual_by: manualBy });
  if (!done) return null;
  await writeLog("info", manualBy ? "order_manual_success" : "donate_success", { orderNo, amount: done.amount, manualBy });
  await notifyUserSuccess(done);
  return done;
}

/** Buyurtma o'chirilmaydi: FAILED + xato saqlanadi, user va admin xabardor qilinadi */
export async function failOrder(orderNo: string, err: unknown): Promise<void> {
  const code = err instanceof ProviderError ? err.code : "UNKNOWN";
  const message = err instanceof Error ? err.message : String(err);
  const failed = await rpc<Order | null>("fail_order", { p_order_no: orderNo, p_code: code, p_message: message });
  if (!failed) return;
  await writeLog("error", "donate_failed", { orderNo, code, message, details: err instanceof ProviderError ? err.details : {} });
  await Promise.all([notifyUserFailure(failed), notifyAdminsFailure(failed, code, message)]);
}

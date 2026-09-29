/**
 * Har daqiqada pg_cron chaqiradi (x-cron-secret bilan).
 *  - PROCESSING buyurtmalarni providerdan tekshirish, qotib qolganlarni FAILED qilish
 *  - trigger o'tkazib yuborgan PAID buyurtmalarni qayta ishga tushirish
 *  - 24 soat to'lanmagan buyurtmalarni bekor qilish
 *  - har 30 daqiqada FastDonate balansini tekshirish (past bo'lsa — adminga xabar, 6 soatda 1 marta)
 */
import { config } from "../_shared/config.ts";
import { db, rpc } from "../_shared/db.ts";
import { safeEqual } from "../_shared/http.ts";
import { writeLog } from "../_shared/logger.ts";
import { getDonateProvider, ProviderError } from "../_shared/providers/donate/index.ts";
import type { Order } from "../_shared/types.ts";
import { checkProcessingOrder, failOrder, processPaidOrder } from "../_shared/services/fulfillment.ts";
import { notifyAdminsLowBalance } from "../_shared/services/notifications.ts";
import { getSetting, mergeSetting } from "../_shared/services/settings.ts";

async function pollOrders() {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  const { data: processing } = await db().from("orders").select("*").eq("status", "PROCESSING").lte("updated_at", iso(30_000)).order("updated_at").limit(50);
  for (const o of (processing ?? []) as Order[]) {
    if (o.provider_order_id) await checkProcessingOrder(o.order_no);
    else if (o.processing_at && new Date(o.processing_at).getTime() < now - 15 * 60_000) {
      await failOrder(o.order_no, new ProviderError("PROVIDER_ERROR", "Provider javobi olinmadi (stuck). Qo‘lda tekshiring."));
    }
  }

  const { data: stuckPaid } = await db().from("orders").select("order_no").eq("status", "PAID").lte("updated_at", iso(60_000)).order("updated_at").limit(10);
  for (const o of stuckPaid ?? []) await processPaidOrder(o.order_no as string);

  const expired = await rpc<number>("expire_unpaid_orders", {});
  const counts = { processing: processing?.length ?? 0, stuckPaid: stuckPaid?.length ?? 0, expired };
  if (counts.processing || counts.stuckPaid || counts.expired) await writeLog("info", "cron_poll", counts);
  return counts;
}

async function checkBalance() {
  const threshold = config.fastdonate.lowBalanceThreshold;
  if (threshold <= 0) return;
  const st = (await getSetting<{ checkedAt?: string; lowNotifiedAt?: string }>("provider_status")) ?? {};
  if (st.checkedAt && Date.now() - new Date(st.checkedAt).getTime() < 30 * 60_000) return;
  let balance: { balance: number; currency: string } | null;
  try {
    balance = await getDonateProvider().getBalance();
  } catch (e) {
    await mergeSetting("provider_status", { connected: false, message: e instanceof ProviderError ? `${e.code}: ${e.message}` : String(e), checkedAt: new Date().toISOString() });
    return;
  }
  if (!balance) return;
  const low = balance.balance < threshold;
  const patch: Record<string, unknown> = { connected: true, balance: balance.balance, currency: balance.currency, lowBalance: low, checkedAt: new Date().toISOString() };
  if (low && (!st.lowNotifiedAt || Date.now() - new Date(st.lowNotifiedAt).getTime() > 6 * 3600_000)) {
    await notifyAdminsLowBalance(balance.balance, balance.currency, threshold);
    patch.lowNotifiedAt = new Date().toISOString();
  }
  await mergeSetting("provider_status", patch);
}

export async function handler(req: Request): Promise<Response> {
  const secret = config.cronSecret;
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return new Response("Unauthorized", { status: 401 });
  try {
    const counts = await pollOrders();
    await checkBalance();
    return new Response(JSON.stringify({ ok: true, ...counts }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    await writeLog("error", "cron_failed", { message: (e as Error).message });
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}

// Testlarda (SLD_TEST=1) server ishga tushmaydi
if (!Deno.env.get("SLD_TEST")) Deno.serve(handler);

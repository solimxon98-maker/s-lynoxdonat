import { config } from "../config.ts";
import { esc, formatSum, productLabel, TIER_LABEL } from "../format.ts";
import { notifyAdmins, sendMessageSafe } from "../telegramApi.ts";
import type { Order } from "../types.ts";

function userLabel(o: Order): string {
  return o.username ? `@${esc(o.username)}` : `${esc(o.first_name)} (ID: ${esc(o.user_id)})`;
}

/** Yangi (to'langan) buyurtma haqida admin xabari */
export async function notifyAdminsNewOrder(o: Order): Promise<void> {
  const text = [
    "🛒 <b>YANGI BUYURTMA</b>", "",
    `Order:\n<b>#${esc(o.order_no)}</b>`, "",
    `👤 User:\n${userLabel(o)}`, "",
    `🎮 MLBB:\n<code>${esc(o.mlbb_id)}</code>`, "",
    `🌐 Server:\n<code>${esc(o.server_id)}</code>`, "",
    `👤 Nickname:\n${esc(o.nickname)}`, "",
    `${o.product.category === "pass" ? "🎫 Propusk" : "💎 Diamond"}:\n${esc(productLabel(o.product))}`, "",
    `💰 Narx:\n${esc(formatSum(o.amount))}${o.price_tier !== "oddiy" ? ` (${TIER_LABEL[o.price_tier]})` : ""}`, "",
    `💳 Payment:\n${o.payment_status}`, "",
    "📦 Status:\nPROCESSING",
    o.mock ? "\n🧪 <i>MOCK rejim</i>" : "",
  ].join("\n");
  await notifyAdmins(text);
}

export async function notifyAdminsFailure(o: Order, code: string, message: string): Promise<void> {
  await notifyAdmins([
    "⚠️ <b>DONAT XATOSI</b>", "",
    `Order: <b>#${esc(o.order_no)}</b>`,
    `User: ${userLabel(o)}`,
    `MLBB: <code>${esc(o.mlbb_id)}</code> (${esc(o.server_id)})`,
    `💎 ${esc(productLabel(o.product))} — ${esc(formatSum(o.amount))}`, "",
    `Xato: <code>${esc(code)}</code>`, esc(message), "",
    code === "TIMEOUT" || code === "NETWORK"
      ? "⚠️ <b>FastDonate'da buyurtma o‘tgan bo‘lishi mumkin!</b> «Qayta yuborish»dan oldin fastdonate.su → buyurtmalar tarixida tekshiring, aks holda olmos ikki marta ketadi."
      : "Admin panel → Buyurtmalar orqali tekshirib, qayta yuborishingiz yoki pulni balansga qaytarishingiz mumkin.",
  ].join("\n"));
}

export async function notifyUserSuccess(o: Order): Promise<void> {
  await sendMessageSafe(o.user_id, [
    "✅ <b>Donat muvaffaqiyatli bajarildi!</b>", "",
    `Buyurtma ID: <b>#${esc(o.order_no)}</b>`,
    `💎 ${esc(productLabel(o.product))}`,
    `👤 ${esc(o.nickname)} (<code>${esc(o.mlbb_id)}</code> / ${esc(o.server_id)})`, "",
    "S-LynoxDonat xizmatidan foydalanganingiz uchun rahmat! 💙",
  ].join("\n"));
}

export async function notifyUserFailure(o: Order): Promise<void> {
  const support = config.telegram.supportUsername;
  await sendMessageSafe(o.user_id, [
    "❌ Buyurtmani bajarishda vaqtinchalik xatolik yuz berdi.", "",
    `Buyurtma ID: <b>#${esc(o.order_no)}</b>`, "",
    support ? `Support bilan bog‘laning: @${esc(support)}` : "Support bilan bog‘laning.",
  ].join("\n"));
}

export async function notifyAdminsLowBalance(balance: number, currency: string, threshold: number): Promise<void> {
  await notifyAdmins([
    "💰 <b>FastDonate balansi past!</b>", "",
    `Joriy balans: <b>${esc(balance)} ${esc(currency)}</b>`,
    `Chegara: ${esc(threshold)} ${esc(currency)}`, "",
    "Buyurtmalar xatoga uchramasligi uchun balansni to‘ldiring.",
  ].join("\n"));
}

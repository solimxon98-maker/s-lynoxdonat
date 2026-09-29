import type { OrderProduct, OrderStatus, Tier } from "./types.ts";

export function formatSum(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
}

/** Toshkent vaqti (UTC+5): 28.09.2026 */
export function formatDate(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600 * 1000);
  return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${t.getUTCFullYear()}`;
}
export function formatDateTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600 * 1000);
  return `${formatDate(d)} ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Telegram HTML uchun xavfsiz */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "⏳ To‘lov kutilmoqda",
  PAID: "💳 To‘lov tasdiqlandi",
  PROCESSING: "🔄 Donat amalga oshirilmoqda",
  SUCCESS: "✅ Donat muvaffaqiyatli",
  FAILED: "❌ Donat xatosi",
  CANCELLED: "🚫 Bekor qilingan",
  REFUNDED: "↩️ Pul balansga qaytarildi",
};

export const TIER_LABEL: Record<Tier, string> = { oddiy: "Oddiy", bronza: "🥉 Bronza", vip: "👑 VIP" };

/** "86 Diamonds", "50+50 Diamonds" yoki propusk nomi */
export function productLabel(p: Pick<OrderProduct, "name" | "category" | "diamonds" | "bonus">): string {
  if (p.category === "pass") return p.name;
  return p.bonus > 0 ? `${p.diamonds}+${p.bonus} Diamonds` : `${p.diamonds} Diamonds`;
}

export function effectiveTier(tier: Tier | null | undefined, until: string | null | undefined, now = Date.now()): Tier {
  if (!tier || tier === "oddiy") return "oddiy";
  return until && new Date(until).getTime() > now ? tier : "oddiy";
}

export const BANK_LABEL: Record<string, string> = { humo: "Humo", uzcard: "Uzcard", uzum: "Uzum", visa: "Visa", mastercard: "Mastercard", other: "Karta" };

/** 9860 1234 5678 9012 */
export function formatCardNumber(n: string): string {
  return n.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}
/** Humo •••• 9012 */
export function cardShort(c: { bank: string; number: string }): string {
  return `${BANK_LABEL[c.bank] ?? "Karta"} •••• ${c.number.slice(-4)}`;
}

import type { OrderStatus, PaymentStatus } from "./types";

const TZ = "Asia/Tashkent";

export function formatSum(n: number): string {
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
}

export function formatNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

type DateLike = number | string | Date | null | undefined;

function toDate(v: DateLike): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 28.09.2026 */
export function formatDate(v: DateLike): string {
  const d = toDate(v);
  if (!d) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return parts.replace(/\//g, ".");
}

/** 28.09.2026 19:52 */
export function formatDateTime(v: DateLike): string {
  const d = toDate(v);
  if (!d) return "—";
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${formatDate(d)} ${time}`;
}

/** Toshkent vaqti bo'yicha kun boshi (offsetDays: 0 = bugun, -1 = kecha) */
export function tashkentDayStart(offsetDays = 0): Date {
  const OFFSET = 5 * 3600 * 1000;
  const local = new Date(Date.now() + OFFSET);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  return new Date(start + offsetDays * 86400 * 1000);
}

/** "2026-09-28" (input[type=date]) -> Toshkent kun boshi */
export function tashkentDateFromInput(value: string, endOfDay = false): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const start = Date.UTC(+m[1], +m[2] - 1, +m[3]) - 5 * 3600 * 1000;
  return new Date(endOfDay ? start + 86400 * 1000 - 1 : start);
}

export interface StatusMeta {
  label: string;
  short: string;
  emoji: string;
  tone: "amber" | "sky" | "violet" | "emerald" | "rose" | "slate";
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  AWAITING_PAYMENT: { label: "To‘lov kutilmoqda", short: "Kutilmoqda", emoji: "⏳", tone: "amber" },
  PAID: { label: "To‘lov tasdiqlandi", short: "To‘landi", emoji: "💳", tone: "sky" },
  PROCESSING: { label: "Donat amalga oshirilmoqda", short: "Jarayonda", emoji: "🔄", tone: "violet" },
  SUCCESS: { label: "Donat muvaffaqiyatli", short: "Muvaffaqiyatli", emoji: "✅", tone: "emerald" },
  FAILED: { label: "Donat xatosi", short: "Xatolik", emoji: "❌", tone: "rose" },
  CANCELLED: { label: "Bekor qilingan", short: "Bekor", emoji: "🚫", tone: "slate" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  PENDING: { label: "PENDING", short: "Kutilmoqda", emoji: "⏳", tone: "amber" },
  PAID: { label: "PAID", short: "To‘langan", emoji: "💳", tone: "emerald" },
  FAILED: { label: "FAILED", short: "Xato", emoji: "❌", tone: "rose" },
  CANCELLED: { label: "CANCELLED", short: "Bekor", emoji: "🚫", tone: "slate" },
};

export const TONE_CLASS: Record<StatusMeta["tone"], string> = {
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rose: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  slate: "border-slate-400/20 bg-slate-400/10 text-slate-300",
};

export function diamondsText(diamonds: number, bonus: number): string {
  return bonus > 0 ? `${formatNumber(diamonds)} + ${formatNumber(bonus)}` : formatNumber(diamonds);
}

/** Buyurtma/paket nomi: "86 Diamonds", "50 + 50 Diamonds" yoki propusk nomi */
export function productText(p: { name: string; category?: string; diamonds: number; bonus: number }): string {
  if (p.category === "pass") return p.name;
  return `${diamondsText(p.diamonds, p.bonus)} Diamonds`;
}

export function productEmoji(p: { category?: string }): string {
  return p.category === "pass" ? "🎫" : "💎";
}

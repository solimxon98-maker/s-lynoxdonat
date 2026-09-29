import type { Product, Tier } from "./types";

/** Ko'rsatish uchun. Haqiqiy narxni HAR DOIM server hisoblaydi. */
export function priceFor(p: Pick<Product, "price" | "priceBronze" | "priceVip">, tier: Tier): number {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
  if (tier === "vip") {
    if (ok(p.priceVip)) return p.priceVip;
    if (ok(p.priceBronze)) return p.priceBronze;
  }
  if (tier === "bronza" && ok(p.priceBronze)) return p.priceBronze;
  return p.price;
}

export const TIER_META: Record<Tier, { label: string; emoji: string; chip: string }> = {
  oddiy: { label: "Oddiy", emoji: "🏷", chip: "border-white/10 bg-white/5 text-slate-300" },
  bronza: { label: "Bronza", emoji: "🥉", chip: "border-orange-400/30 bg-orange-400/10 text-orange-300" },
  vip: { label: "VIP", emoji: "👑", chip: "border-amber-300/40 bg-amber-300/10 text-amber-200" },
};

/** Muddati o'tgan tarifni oddiy deb hisoblash (Admin Users jadvali uchun) */
export function activeTier(tier: Tier | undefined, untilMs: number | null | undefined, now = Date.now()): Tier {
  if (!tier || tier === "oddiy") return "oddiy";
  return (untilMs ?? 0) > now ? tier : "oddiy";
}

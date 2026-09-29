import { config } from "../config.ts";
import { rpc } from "../db.ts";
import { effectiveTier, esc, formatDateTime } from "../format.ts";
import { writeLog } from "../logger.ts";
import { sendMessageSafe, tg } from "../telegramApi.ts";
import type { TgUser } from "../types.ts";

export const REF_BRONZA_AT = 5;
export const REF_VIP_AT = 10;

let cachedUsername: string | null = null;

export async function botUsername(): Promise<string | null> {
  if (config.telegram.botUsername) return config.telegram.botUsername;
  if (cachedUsername) return cachedUsername;
  try {
    cachedUsername = (await tg<{ username?: string }>("getMe", {})).username ?? null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}

export async function referralLink(telegramId: number): Promise<string | null> {
  const u = await botUsername();
  return u ? `https://t.me/${u}?start=ref_${telegramId}` : null;
}

/** "/start ref_123456" -> 123456 */
export function parseRefPayload(text: string): number | null {
  const m = /^\/start(?:@\w+)?\s+ref_(\d{3,20})\b/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

export function referralProgress(u: Pick<TgUser, "referrals_total" | "referral_cycle">) {
  return { total: u.referrals_total ?? 0, cycle: u.referral_cycle ?? 0, bronzaAt: REF_BRONZA_AT, vipAt: REF_VIP_AT };
}

interface CreditResult {
  credited: boolean;
  reason?: string;
  total?: number;
  cycle?: number;
  reward?: "bronza" | "vip" | null;
  until?: string | null;
  referrer?: { id: number; tier: TgUser["tier"]; tier_until: string | null };
}

/**
 * Faqat botga BIRINCHI marta kirgan foydalanuvchi hisoblanadi (isNew).
 * Hisob va mukofot credit_referral SQL funksiyasida atomik bajariladi.
 */
export async function creditReferral(newUser: TgUser & { isNew: boolean }, referrerId: number): Promise<CreditResult> {
  if (!newUser.isNew) return { credited: false, reason: "not_new" };
  const r = await rpc<CreditResult>("credit_referral", { p_new_user_id: newUser.id, p_referrer_id: referrerId });
  await writeLog(r.credited ? "info" : "warn", `referral_${r.credited ? "credited" : r.reason}`, {
    referrer: referrerId, newUser: newUser.id, total: r.total ?? null, reward: r.reward ?? null,
  });
  if (r.credited) await notifyReferrer(referrerId, r, newUser);
  return r;
}

async function notifyReferrer(referrerId: number, r: CreditResult, newUser: TgUser) {
  const who = newUser.username ? `@${esc(newUser.username)}` : esc(newUser.first_name);
  if (r.reward && r.until) {
    const label = r.reward === "vip" ? "👑 VIP" : "🥉 Bronza";
    await sendMessageSafe(referrerId, [
      `🎉 <b>Tabriklaymiz! Sizga ${label} narxlar berildi</b>`, "",
      `👥 Yangi do‘st: ${who}`,
      `Jami taklif qilganlaringiz: <b>${r.total}</b>`,
      `⏳ ${label} narx <b>${formatDateTime(new Date(r.until))}</b> gacha amal qiladi`, "",
      r.reward === "vip"
        ? `🔁 Yana ${REF_VIP_AT} ta do‘st taklif qilsangiz — VIP yana 1 haftaga uzayadi!`
        : `👑 Yana ${REF_VIP_AT - REF_BRONZA_AT} ta do‘st — VIP narx!`,
    ].join("\n"));
    return;
  }
  const cycle = r.cycle ?? 0;
  const vip = r.referrer ? effectiveTier(r.referrer.tier, r.referrer.tier_until) === "vip" : false;
  const next = cycle < REF_BRONZA_AT && !vip ? REF_BRONZA_AT : REF_VIP_AT;
  await sendMessageSafe(referrerId, [
    `👥 Havolangiz orqali yangi do‘st qo‘shildi: ${who}`, "",
    `Hisob: <b>${cycle}/${REF_VIP_AT}</b> (jami ${r.total})`,
    `${next === REF_BRONZA_AT ? "🥉 Bronza" : "👑 VIP"} narxgacha yana <b>${next - cycle}</b> ta do‘st qoldi!`,
  ].join("\n"));
}

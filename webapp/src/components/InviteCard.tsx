import { Check, Copy, Send, Users } from "lucide-react";
import { useState } from "react";
import { haptic, openExternal } from "../lib/telegram";
import type { Profile, Tier } from "../lib/types";

/** Do'st taklif qilish: havola, nusxalash, ulashish va 10 talik hisob */
export function InviteCard({ referral, tier }: { referral: NonNullable<Profile["referral"]>; tier: Tier }) {
  const [copied, setCopied] = useState(false);
  const { cycle, total, bronzaAt, vipAt, link } = referral;
  const next = cycle < bronzaAt && tier !== "vip" ? bronzaAt : vipAt;
  const nextLabel = next === bronzaAt ? "🥉 Bronza" : "👑 VIP";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      haptic.success();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard ruxsat berilmagan — havola ekranda ko'rinib turibdi */
    }
  }

  function share() {
    if (!link) return;
    haptic.tap();
    const text = "💎 MLBB almazlarni arzon va tez — S-LynoxDonat!";
    openExternal(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  }

  return (
    <section className="card-glow p-5 animate-fade-up" aria-labelledby="invite-title">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-neon-blue" />
        <h2 id="invite-title" className="font-display text-base font-bold text-white">
          Do‘st taklif qiling
        </h2>
      </div>
      <p className="mt-1.5 text-sm text-slate-400">
        Botga {bronzaAt} ta do‘st — 🥉 Bronza, {vipAt} ta — 👑 VIP narx, 1 hafta. Har keyingi {vipAt} ta — VIP yana +1 hafta.
      </p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-slate-300">
            Hisob: <b className="text-white">{cycle}</b>/{vipAt}
          </span>
          <span className="text-slate-500">jami: {total}</span>
        </div>
        <div className="relative mt-2 grid grid-cols-10 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={vipAt} aria-valuenow={cycle}>
          {Array.from({ length: vipAt }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 rounded-full ${
                i < cycle ? (i < bronzaAt ? "bg-orange-400" : "bg-amber-300") : "bg-white/10"
              } ${i === bronzaAt - 1 || i === vipAt - 1 ? "ring-1 ring-white/30" : ""}`}
            />
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-10 text-[10px] text-slate-500">
          <span className="col-start-5 text-center">🥉</span>
          <span className="col-start-10 text-center">👑</span>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          {nextLabel} narxgacha yana <b className="text-white">{next - cycle}</b> ta do‘st
        </p>
      </div>

      {link ? (
        <>
          <p className="mt-4 break-all rounded-xl bg-ink-950/70 px-3 py-2.5 font-mono text-xs text-sky-200 ring-1 ring-white/5">{link}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost py-2.5 text-sm" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Nusxalandi" : "Nusxalash"}
            </button>
            <button className="btn-primary py-2.5 text-sm" onClick={share}>
              <Send size={16} /> Ulashish
            </button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-xs text-slate-500">Havola bot sozlangandan so‘ng paydo bo‘ladi.</p>
      )}
      <p className="mt-3 text-[11px] text-slate-500">Faqat botga birinchi marta kirgan yangi odamlar hisoblanadi.</p>
    </section>
  );
}

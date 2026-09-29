import { AtSign, CalendarDays, Hash, MessageCircle, Package, Wallet } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { InviteCard } from "../components/InviteCard";
import { Logo } from "../components/Logo";
import { PageHeader } from "../components/ui";
import { useTelegramAuth } from "../context/AuthContext";
import { formatDate, formatDateTime, formatSum } from "../lib/format";
import { TIER_META } from "../lib/tier";
import { openExternal } from "../lib/telegram";

export function ProfilePage() {
  const { profile, refreshProfile, supportUsername } = useTelegramAuth();

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  if (!profile) return null;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <PageHeader title="Profil" />

      <div className="card-glow flex items-center gap-4 p-5 animate-fade-up">
        {profile.photoUrl ? (
          <img src={profile.photoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-neon-blue/40" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-blue/30 to-neon-purple/30 font-display text-2xl font-bold text-white ring-2 ring-neon-blue/40">
            {(profile.firstName || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-white">{fullName || "—"}</p>
          <p className="truncate text-sm text-slate-400">{profile.username ? `@${profile.username}` : "Username yo‘q"}</p>
        </div>
      </div>

      <Link to="/wallet" className="card-glow flex items-center justify-between gap-3 px-4 py-4 animate-fade-up">
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <Wallet size={18} className="text-neon-blue" /> Balans
        </span>
        <span className="text-right">
          <b className="font-display text-lg text-gradient">{formatSum(profile.balance ?? 0)}</b>
          <span className="block text-[11px] text-slate-500">To‘ldirish →</span>
        </span>
      </Link>

      <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 animate-fade-up ${TIER_META[profile.tier ?? "oddiy"].chip}`}>
        <span className="text-sm font-bold">
          {TIER_META[profile.tier ?? "oddiy"].emoji} Tarif: {TIER_META[profile.tier ?? "oddiy"].label}
        </span>
        <span className="text-xs opacity-80">
          {profile.tier && profile.tier !== "oddiy" && profile.tierUntil ? `⏳ ${formatDateTime(profile.tierUntil)} gacha` : "5 do‘st — Bronza · 10 do‘st — VIP"}
        </span>
      </div>

      {profile.referral && <InviteCard referral={profile.referral} tier={profile.tier ?? "oddiy"} />}

      <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: "60ms" }}>
        <Stat icon={<Package size={18} />} label="Buyurtmalar soni" value={String(profile.ordersCount)} />
        <Stat icon={<Wallet size={18} />} label="Umumiy xarajat" value={formatSum(profile.totalSpent)} />
      </div>

      <div className="card divide-y divide-white/5 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <Row icon={<AtSign size={16} />} label="Telegram username" value={profile.username ? `@${profile.username}` : "—"} />
        <Row icon={<Hash size={16} />} label="Telegram ID" value={profile.telegramId} />
        <Row icon={<span className="text-sm">👤</span>} label="First name" value={profile.firstName || "—"} />
        <Row icon={<CalendarDays size={16} />} label="Ro‘yxatdan o‘tgan sana" value={formatDate(profile.createdAt)} />
      </div>

      {supportUsername && (
        <button className="btn-ghost w-full" onClick={() => openExternal(`https://t.me/${supportUsername}`)}>
          <MessageCircle size={18} /> Yordam / Support
        </button>
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-slate-600">
        <Logo size={18} className="rounded-md" /> S-LynoxDonat
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="mb-2 text-neon-blue">{icon}</div>
      <p className="font-display text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <span className="flex items-center gap-2 text-sm text-slate-400">
        <span className="text-slate-500">{icon}</span>
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

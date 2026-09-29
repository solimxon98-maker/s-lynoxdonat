import { Bot, ChevronRight, Clock3, Gem, ShieldCheck, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { MockBadge } from "../components/ui";
import { useTelegramAuth } from "../context/AuthContext";
import { haptic } from "../lib/telegram";
import { TIER_META } from "../lib/tier";

const features = [
  { icon: Zap, title: "Tezkor xizmat", text: "Diamondlar bir necha daqiqada", color: "from-cyan-400/25 to-sky-500/10 text-cyan-300" },
  { icon: ShieldCheck, title: "Xavfsiz to‘lov", text: "Himoyalangan tranzaksiyalar", color: "from-violet-400/25 to-indigo-500/10 text-violet-300" },
  { icon: Bot, title: "Avtomatik buyurtma", text: "Operator kutish shart emas", color: "from-fuchsia-400/25 to-purple-500/10 text-fuchsia-300" },
  { icon: Clock3, title: "24/7 buyurtma", text: "Istalgan vaqtda xarid", color: "from-sky-400/25 to-blue-500/10 text-sky-300" },
];

const steps = [
  { n: "01", t: "MLBB ID va Serverni kiriting" },
  { n: "02", t: "Diamond paketini tanlang" },
  { n: "03", t: "To‘lang — diamondlar avtomatik keladi" },
];

export function HomePage() {
  const navigate = useNavigate();
  const { profile, mockMode } = useTelegramAuth();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between animate-fade-up">
        <div className="flex items-center gap-3">
          <Logo size={42} />
          <div>
            <p className="font-display text-[15px] font-bold leading-tight text-white">S-LynoxDonat</p>
            <p className="text-xs text-slate-400">Salom, {profile?.firstName || "do‘st"} 👋</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile && profile.tier !== "oddiy" && (
            <span className={`chip ${TIER_META[profile.tier].chip}`}>
              {TIER_META[profile.tier].emoji} {TIER_META[profile.tier].label}
            </span>
          )}
          {mockMode && <MockBadge />}
        </div>
      </header>

      <section className="card-glow relative overflow-hidden px-5 pb-6 pt-7 animate-fade-up" style={{ animationDelay: "60ms" }}>
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-neon-purple/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-neon-blue/20 blur-3xl" />

        <div className="relative">
          <span className="chip border-neon-blue/30 bg-neon-blue/10 text-neon-blue">
            <Gem size={13} /> Mobile Legends: Bang Bang
          </span>
          <h1 className="mt-4 font-display text-[30px] font-extrabold leading-[1.1] tracking-tight">
            <span className="text-gradient">S-LynoxDonat</span>
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-slate-300">Mobile Legends uchun tezkor va qulay donat</p>

          <div className="relative mt-6 flex justify-center">
            <div className="animate-float text-[64px] leading-none drop-shadow-[0_0_28px_rgba(46,230,255,0.7)]">💎</div>
          </div>

          <button
            className="btn-primary mt-6 w-full py-4 text-base tracking-wide"
            onClick={() => {
              haptic.tap();
              navigate("/donate");
            }}
          >
            💎 DONAT QILISH
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {features.map(({ icon: Icon, title, text, color }, i) => (
          <div key={title} className="card p-4 animate-fade-up" style={{ animationDelay: `${120 + i * 50}ms` }}>
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-white/10 ${color}`}>
              <Icon size={20} />
            </div>
            <p className="text-sm font-bold text-white">{title}</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-400">{text}</p>
          </div>
        ))}
      </section>

      <section className="card p-5 animate-fade-up" style={{ animationDelay: "320ms" }}>
        <p className="mb-4 font-display text-sm font-bold text-white">Qanday ishlaydi?</p>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.n} className="flex items-center gap-3">
              <span className="font-display text-xs font-bold text-neon-blue">{s.n}</span>
              <span className="h-px w-4 bg-gradient-to-r from-neon-blue/60 to-transparent" />
              <span className="text-sm text-slate-300">{s.t}</span>
            </li>
          ))}
        </ol>
      </section>

      <Link to="/orders" className="card flex items-center justify-between p-4 transition hover:bg-ink-800/80 animate-fade-up" style={{ animationDelay: "380ms" }}>
        <div>
          <p className="text-sm font-bold text-white">Buyurtmalarim</p>
          <p className="text-xs text-slate-400">Holat va tarixni kuzating</p>
        </div>
        <ChevronRight className="text-slate-500" size={20} />
      </Link>
    </div>
  );
}

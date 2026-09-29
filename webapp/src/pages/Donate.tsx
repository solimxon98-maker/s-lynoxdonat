import { CheckCircle2, Gem, Pencil, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, EmptyState, MockBadge, PageHeader, Spinner } from "../components/ui";
import { useTelegramAuth } from "../context/AuthContext";
import { api, errorMessage, newIdempotencyKey } from "../lib/api";
import { usePoll } from "../lib/usePoll";
import { formatNumber, formatSum, productText } from "../lib/format";
import { bindBackButton, haptic, openExternal } from "../lib/telegram";
import type { PlayerCheck, Product, ProductCategory, Tier } from "../lib/types";
import { priceFor, TIER_META } from "../lib/tier";
import { formatDateTime } from "../lib/format";

const LS_KEY = "sld:last-account";

function loadLast(): { mlbbId: string; serverId: string } {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
    if (v && typeof v.mlbbId === "string" && typeof v.serverId === "string") return v;
  } catch {
    /* localStorage mavjud emas */
  }
  return { mlbbId: "", serverId: "" };
}

function saveLast(mlbbId: string, serverId: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ mlbbId, serverId }));
  } catch {
    /* noop */
  }
}

interface CreateOrderResponse {
  order: { id: string; orderNo: string; amount: number };
  payment: { id: string; mode: "balance" | "in_app_mock" | "redirect"; payUrl: string | null; status: string };
  balancePay?: { result: "paid" | "already_paid" | "insufficient" | "closed"; balance: number; need: number };
}

export function DonatePage() {
  const navigate = useNavigate();
  const { mockMode, profile, refreshProfile } = useTelegramAuth();
  const tier: Tier = profile?.tier ?? "oddiy";
  const last = useMemo(loadLast, []);

  const [mlbbId, setMlbbId] = useState(last.mlbbId);
  const [serverId, setServerId] = useState(last.serverId);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerCheck | null>(null);

  const [selected, setSelected] = useState<Product | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idemKey = useRef<string>("");
  const packagesRef = useRef<HTMLDivElement>(null);

  // Paketlar serverdan; admin narxni o'zgartirsa 30 soniya ichida (yoki ilovaga qaytganda) yangilanadi
  const { data: productsData, error: productsError } = usePoll(() => api<{ products: Product[] }>("/products"), 30_000);
  const products = productsData?.products ?? null;

  // Tanlangan paket narxi o'zgarsa yoki faolsizlansa — tasdiqlash oynasini yangilash
  useEffect(() => {
    if (!selected || !products) return;
    const fresh = products.find((p) => p.id === selected.id);
    if (!fresh) {
      setSelected(null);
      setSubmitError(null);
    } else if (fresh.price !== selected.price || fresh.diamonds !== selected.diamonds || fresh.bonus !== selected.bonus) {
      setSelected(fresh);
    }
  }, [products, selected]);

  useEffect(() => {
    if (!selected) return;
    return bindBackButton(() => setSelected(null));
  }, [selected]);

  const idValid = /^\d{5,12}$/.test(mlbbId);
  const serverValid = /^\d{1,6}$/.test(serverId);

  async function checkAccount() {
    if (!idValid || !serverValid) {
      setCheckError("MLBB ID (5–12 raqam) va Server ID ni to‘g‘ri kiriting.");
      haptic.error();
      return;
    }
    haptic.tap();
    setChecking(true);
    setCheckError(null);
    setPlayer(null);
    try {
      const r = await api<PlayerCheck>("/player/check", { body: { mlbbId, serverId } });
      if (!r.found) {
        setCheckError("Akkaunt topilmadi. MLBB ID va Serverni tekshiring.");
        haptic.error();
      } else {
        setPlayer(r);
        saveLast(mlbbId, serverId);
        haptic.success();
        setTimeout(() => packagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      }
    } catch (e) {
      setCheckError(errorMessage(e));
      haptic.error();
    } finally {
      setChecking(false);
    }
  }

  function resetAccount() {
    setPlayer(null);
    setSelected(null);
  }

  function choose(p: Product) {
    if (!player) return;
    haptic.select();
    idemKey.current = newIdempotencyKey(); // har bir yangi tasdiqlash uchun yangi kalit
    setSubmitError(null);
    setSelected(p);
  }

  async function pay() {
    if (!player || !selected || submitting) return;
    haptic.tap();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api<CreateOrderResponse>("/orders", {
        body: { productId: selected.id, mlbbId: player.mlbbId, serverId: player.serverId, idempotencyKey: idemKey.current, payWithBalance: true },
      });
      if (r.balancePay) {
        refreshProfile().catch(() => undefined);
        if (r.balancePay.result === "insufficient") {
          haptic.tap();
          navigate(`/wallet?order=${encodeURIComponent(r.order.orderNo)}&need=${r.order.amount}`);
        } else {
          haptic.success();
          navigate(`/orders/${r.order.id}`);
        }
        return;
      }
      haptic.success();
      if (r.payment.mode === "redirect" && r.payment.payUrl) {
        openExternal(r.payment.payUrl);
        navigate(`/orders/${r.order.id}`);
      } else {
        navigate(`/pay/${r.payment.id}`);
      }
    } catch (e) {
      setSubmitError(errorMessage(e));
      haptic.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Donat qilish" subtitle="Mobile Legends Diamonds" right={mockMode ? <MockBadge /> : undefined} />

      {/* 1-qadam: akkaunt */}
      <section className="card-glow p-5 animate-fade-up">
        <div className="mb-4 flex items-center gap-2">
          <StepDot n={1} active={!player} done={!!player} />
          <p className="font-display text-sm font-bold text-white">O‘yin akkaunti</p>
        </div>

        {!player ? (
          <>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div>
                <label className="label" htmlFor="mlbb">MLBB ID</label>
                <input
                  id="mlbb"
                  className="input font-semibold tracking-wide"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123456789"
                  maxLength={12}
                  value={mlbbId}
                  onChange={(e) => {
                    setMlbbId(e.target.value.replace(/\D/g, ""));
                    setCheckError(null);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="server">Server</label>
                <input
                  id="server"
                  className="input font-semibold tracking-wide"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="1234"
                  maxLength={6}
                  value={serverId}
                  onChange={(e) => {
                    setServerId(e.target.value.replace(/\D/g, ""));
                    setCheckError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && checkAccount()}
                />
              </div>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">ID va Server o‘yindagi profil sahifangizda ko‘rsatilgan.</p>
            <p className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
              ⚠️ 🇷🇺 Ru va 🇹🇷 Turk akkauntlariga donat mavjud emas.
            </p>

            {checkError && (
              <div className="mt-4">
                <Alert>{checkError}</Alert>
              </div>
            )}

            <button className="btn-primary mt-5 w-full" onClick={checkAccount} disabled={checking || !mlbbId || !serverId}>
              {checking ? <Spinner size={18} /> : <Search size={18} />}
              {checking ? "Tekshirilmoqda..." : "🔍 AKKAUNTNI TEKSHIRISH"}
            </button>
          </>
        ) : (
          <div className="animate-fade-up">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 size={18} />
              <span className="text-sm font-bold">Akkaunt topildi</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-ink-950/60 p-3 ring-1 ring-white/5">
              <Info label="Nickname" value={player.nickname ?? "—"} wide />
              <Info label="MLBB ID" value={player.mlbbId} />
              <Info label="Server" value={player.serverId} />
            </div>
            {!player.verificationSupported && (
              <p className="mt-2 text-xs text-amber-300/80">Provider nickname tekshirishni qo‘llamaydi — ID ni diqqat bilan tekshiring.</p>
            )}
            <button className="btn-ghost mt-3 w-full py-2.5 text-sm" onClick={resetAccount}>
              <Pencil size={15} /> Akkauntni o‘zgartirish
            </button>
          </div>
        )}
      </section>

      {/* 2-qadam: paketlar */}
      <section ref={packagesRef} className="mt-6 scroll-mt-4">
        <div className="mb-3 flex items-center gap-2 px-1">
          <StepDot n={2} active={!!player} done={false} />
          <p className="font-display text-sm font-bold text-white">Paketni tanlang</p>
        </div>

        <TierBanner tier={tier} until={profile?.tierUntil ?? null} />

        {productsError && <Alert>Paketlarni yuklab bo‘lmadi: {productsError}</Alert>}
        {!products && !productsError && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-[124px] animate-pulse" />
            ))}
          </div>
        )}
        {products && products.length === 0 && (
          <EmptyState icon={<Gem size={28} />} title="Paketlar hali qo‘shilmagan" text="Tez orada diamond paketlari paydo bo‘ladi." />
        )}
        {products && products.length > 0 && (
          <div className={`space-y-6 transition ${player ? "" : "pointer-events-none opacity-45 saturate-50"}`}>
            {SECTIONS.map((sec) => {
              const list = products.filter((p) => (p.category ?? "diamonds") === sec.id);
              if (!list.length) return null;
              return (
                <div key={sec.id}>
                  <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
                    <p className="text-sm font-bold text-white">
                      {sec.emoji} {sec.title}
                    </p>
                    {sec.hint && <p className="text-[11px] text-slate-500">{sec.hint}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {list.map((p, i) => (
                      <ProductCard key={p.id} p={p} tier={tier} index={i} onClick={() => choose(p)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!player && products && products.length > 0 && (
          <p className="mt-3 text-center text-xs text-slate-500">Avval akkauntni tekshiring</p>
        )}
      </section>

      {/* 3-qadam: tasdiqlash */}
      {selected && player && (
        <ConfirmSheet
          product={selected}
          tier={tier}
          player={player}
          submitting={submitting}
          error={submitError}
          mock={mockMode}
          balance={profile?.balance ?? 0}
          onClose={() => !submitting && setSelected(null)}
          onPay={pay}
        />
      )}
    </div>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${
        done
          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40"
          : active
            ? "bg-neon-blue/15 text-neon-blue ring-neon-blue/50 shadow-glow-sm"
            : "bg-white/5 text-slate-500 ring-white/10"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-3 border-b border-white/5 pb-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`truncate font-bold text-white ${wide ? "text-base" : "text-sm"}`}>{value}</p>
    </div>
  );
}

function ConfirmSheet(props: {
  product: Product;
  tier: Tier;
  player: PlayerCheck;
  submitting: boolean;
  error: string | null;
  mock: boolean;
  balance: number;
  onClose: () => void;
  onPay: () => void;
}) {
  const { product, tier, player, submitting, error, mock, balance, onClose, onPay } = props;
  const price = priceFor(product, tier);
  const enough = balance >= price;
  const rows: [string, string, string][] = [
    ["🎮", "O‘yin", "Mobile Legends"],
    ["👤", "Nickname", player.nickname ?? "—"],
    ["🆔", "MLBB ID", player.mlbbId],
    ["🌐", "Server", player.serverId],
    product.category === "pass" ? ["🎫", "Propusk", product.name] : ["💎", "Diamond", productText(product)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="card-glow relative w-full max-w-md rounded-b-none px-5 pt-5 animate-fade-up sm:rounded-b-3xl"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">Buyurtma tasdiqlash</h2>
          <button className="rounded-full p-2 text-slate-400 hover:bg-white/5" onClick={onClose} aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <div className="divide-y divide-white/5 rounded-2xl bg-ink-950/60 ring-1 ring-white/5">
          {rows.map(([emoji, label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-slate-400">
                {emoji} {label}
              </span>
              <span className="truncate text-right text-sm font-bold text-white">{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm text-slate-400">
              💰 Narx
              {tier !== "oddiy" && price < product.price && (
                <span className={`chip ml-2 px-2 py-0.5 text-[10px] ${TIER_META[tier].chip}`}>
                  {TIER_META[tier].emoji} {TIER_META[tier].label}
                </span>
              )}
            </span>
            <span className="text-right">
              {price < product.price && <span className="block text-xs text-slate-500 line-through">{formatSum(product.price)}</span>}
              <span className="font-display text-xl font-bold text-gradient">{formatSum(price)}</span>
            </span>
          </div>
        </div>

        <div className={`mt-3 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${enough ? "border-emerald-400/20 bg-emerald-400/5" : "border-amber-400/30 bg-amber-400/10"}`}>
          <span className="text-slate-300">💼 Balansingiz</span>
          <span className="text-right">
            <b className="text-white">{formatSum(balance)}</b>
            {!enough && <span className="block text-xs text-amber-300">yana {formatSum(price - balance)} kerak</span>}
          </span>
        </div>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <button className="btn-primary mt-5 w-full py-4 text-base" onClick={onPay} disabled={submitting}>
          {submitting ? <Spinner size={18} /> : null}
          {submitting ? "Buyurtma yaratilmoqda..." : enough ? "💼 BALANSDAN TO‘LASH" : "➕ BALANSNI TO‘LDIRISH"}
        </button>
        {!enough && !submitting && (
          <p className="mt-2 text-center text-xs text-slate-400">Buyurtma saqlanadi — balansni to‘ldirgach bir bosishda to‘laysiz</p>
        )}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck size={13} />
          {mock ? "Test rejim: olmos haqiqatda yuborilmaydi" : "Donat faqat to‘lov tasdiqlangandan so‘ng yuboriladi"}
        </p>
        {product.oncePerAccount && (
          <p className="mt-2 text-center text-xs text-fuchsia-300/90">🎁 Bonus paket bitta akkauntga faqat 1 marta beriladi</p>
        )}
      </div>
    </div>
  );
}

const SECTIONS: { id: ProductCategory; emoji: string; title: string; hint?: string }[] = [
  { id: "bonus", emoji: "🎁", title: "Bonus paketlar", hint: "1 martalik" },
  { id: "diamonds", emoji: "💎", title: "Olmos paketlari" },
  { id: "pass", emoji: "🎟", title: "Propusklar" },
];

function ProductCard({ p, tier, index, onClick }: { p: Product; tier: Tier; index: number; onClick: () => void }) {
  const isPass = p.category === "pass";
  const price = priceFor(p, tier);
  return (
    <button
      onClick={onClick}
      className="card group relative overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:border-neon-blue/40 hover:shadow-glow-sm active:scale-[0.98] animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-neon-blue/10 blur-2xl transition group-hover:bg-neon-purple/25" />
      <div className="relative">
        {isPass ? (
          <>
            <span className="text-xl">🎫</span>
            <p className="mt-1 min-h-[40px] text-sm font-bold leading-tight text-white">{p.name}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xl drop-shadow-[0_0_10px_rgba(46,230,255,0.8)]">💎</span>
              <span className="font-display text-lg font-bold text-white">{formatNumber(p.diamonds)}</span>
              {p.bonus > 0 && <span className="font-display text-sm font-bold text-fuchsia-300">+{formatNumber(p.bonus)}</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Diamonds</p>
            {p.oncePerAccount ? (
              <span className="chip mt-2 border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-[11px] text-fuchsia-300">🎁 1 martalik</span>
            ) : (
              <span className="mt-2 block h-[22px]" />
            )}
          </>
        )}
        <div className="mt-3">
          {price < p.price && <p className="text-[11px] leading-none text-slate-500 line-through">{formatSum(p.price)}</p>}
          <p className="text-[15px] font-extrabold text-neon-blue">{formatSum(price)}</p>
        </div>
      </div>
    </button>
  );
}

function TierBanner({ tier, until }: { tier: Tier; until: number | null }) {
  if (tier === "oddiy") {
    return (
      <div className="card mb-4 flex items-center gap-3 px-4 py-3 text-xs text-slate-300">
        <span className="text-lg">😏</span>
        <span>
          Arzonroq olmoqchimisiz? Botga <b className="text-orange-300">5 ta</b> do‘st taklif qiling — 🥉 Bronza,{" "}
          <b className="text-amber-200">10 ta</b> — 👑 VIP narx!{" "}
          <Link to="/profile" className="font-bold text-neon-blue underline-offset-2 hover:underline">
            Havolani olish →
          </Link>
        </span>
      </div>
    );
  }
  const m = TIER_META[tier];
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${m.chip}`}>
      <span className="text-sm font-bold">
        {m.emoji} Sizda {m.label} narxlar
      </span>
      {until && <span className="text-xs opacity-80">⏳ {formatDateTime(until)} gacha</span>}
    </div>
  );
}

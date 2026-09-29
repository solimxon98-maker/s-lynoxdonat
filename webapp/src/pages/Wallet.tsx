import { ArrowDownLeft, ArrowUpRight, Check, Copy, CreditCard, Gem, ImageUp, Wallet as WalletIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, FullScreenLoader, MockBadge, PageHeader, Spinner } from "../components/ui";
import { useTelegramAuth } from "../context/AuthContext";
import { api, errorMessage, newIdempotencyKey } from "../lib/api";
import { formatCard, formatDateTime, formatNumber, formatSum, TONE_CLASS, TOPUP_STATUS, TX_KIND } from "../lib/format";
import { compressImage } from "../lib/image";
import { bindBackButton, copyText, haptic } from "../lib/telegram";
import type { PaymentCard, Topup, WalletData } from "../lib/types";
import { usePoll } from "../lib/usePoll";

const QUICK = [20000, 50000, 100000, 200000, 500000];

export function WalletPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const need = Math.max(0, Number(params.get("need")) || 0);
  const orderNo = /^SLD-\d{6,}$/.test(params.get("order") ?? "") ? params.get("order")! : null;
  const { profile, refreshProfile, mockMode, supportUsername } = useTelegramAuth();

  useEffect(() => bindBackButton(() => navigate(orderNo ? "/donate" : "/")), [navigate, orderNo]);

  const [fast, setFast] = useState(false);
  const { data, error, refresh } = usePoll(() => api<WalletData>("/wallet"), fast ? 5000 : 30000, [fast]);
  const open = useMemo(() => (data?.topups ?? []).filter((t) => t.status === "AWAITING_RECEIPT" || t.status === "PENDING"), [data]);
  useEffect(() => setFast(open.some((t) => t.status === "PENDING")), [open]);

  // Balans o'zgarsa — profilni ham yangilaymiz (Donat sahifasi to'g'ri ko'rsatishi uchun)
  const lastBalance = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    if (lastBalance.current !== null && data.balance > lastBalance.current) haptic.success();
    if (profile && data.balance !== profile.balance) refreshProfile().catch(() => undefined);
    lastBalance.current = data.balance;
  }, [data, profile, refreshProfile]);

  if (!data && !error) return <FullScreenLoader text="Balans yuklanmoqda..." />;

  const awaiting = open.find((t) => t.status === "AWAITING_RECEIPT") ?? null;

  return (
    <div>
      <PageHeader title="Balans" subtitle="Hisobni to‘ldirish va tarix" right={mockMode ? <MockBadge /> : undefined} />
      {error && !data && <Alert>{error}</Alert>}

      {data && (
        <div className="space-y-4">
          <BalanceCard balance={data.balance} />

          {orderNo && <PayPendingOrder orderNo={orderNo} balance={data.balance} need={need} onPaid={() => navigate(`/orders/${orderNo}`, { replace: true })} />}
          {!orderNo && need > 0 && data.balance < need && (
            <Alert tone="amber">Tanlangan paket uchun balansga yana <b>{formatSum(need - data.balance)}</b> kerak.</Alert>
          )}

          {open.filter((t) => t.status === "PENDING").map((t) => <PendingCard key={t.topupNo} t={t} />)}

          {awaiting ? (
            <TransferCard t={awaiting} onUploaded={refresh} />
          ) : data.cards.length === 0 ? (
            <Alert tone="amber">
              Hozircha to‘lov kartasi qo‘shilmagan. {supportUsername ? <>Support: <b>@{supportUsername}</b></> : "Support bilan bog‘laning."}
            </Alert>
          ) : (
            <NewTopup cards={data.cards} suggested={orderNo || need ? Math.max(0, need - data.balance) : 0} disabled={open.length >= 3} onCreated={refresh} />
          )}

          <History data={data} />
        </div>
      )}
    </div>
  );
}

function BalanceCard({ balance }: { balance: number }) {
  return (
    <div className="card-glow relative overflow-hidden p-5 animate-fade-up">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-neon-violet/20 blur-3xl" />
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <WalletIcon size={14} /> Balansingiz
      </p>
      <p className="mt-2 font-display text-4xl font-bold text-gradient">{formatSum(balance)}</p>
      <Link to="/donate" className="btn-ghost mt-4 w-full py-3 text-sm" onClick={() => haptic.tap()}>
        <Gem size={16} /> Olmos sotib olish
      </Link>
    </div>
  );
}

function PayPendingOrder({ orderNo, balance, need, onPaid }: { orderNo: string; balance: number; need: number; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const enough = need > 0 ? balance >= need : balance > 0;
  async function pay() {
    haptic.tap();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ result: string; need: number }>(`/orders/${orderNo}/pay`, { body: {} });
      if (r.result === "paid" || r.result === "already_paid") {
        haptic.success();
        onPaid();
      } else setErr(`Balans yetmaydi — yana ${formatSum(r.need)} kerak.`);
    } catch (e) {
      setErr(errorMessage(e));
      haptic.error();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`rounded-2xl border p-4 ${enough ? TONE_CLASS.emerald : TONE_CLASS.amber}`}>
      <p className="text-sm">
        🛒 Buyurtma <b>#{orderNo}</b>
        {need > 0 && <> — <b>{formatSum(need)}</b></>}
      </p>
      {!enough && need > 0 && <p className="mt-1 text-xs opacity-90">Balansni yana {formatSum(need - balance)} ga to‘ldiring, so‘ng to‘lang.</p>}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <button className="btn-primary mt-3 w-full py-3 text-sm" onClick={pay} disabled={busy || !enough}>
        {busy ? <Spinner size={16} /> : "💼"} Balansdan to‘lash
      </button>
    </div>
  );
}

function PendingCard({ t }: { t: Topup }) {
  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">#{t.topupNo} · {formatSum(t.amount)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t.card.bankLabel} •••• {t.card.number.slice(-4)}</p>
        </div>
        <span className={`chip ${TONE_CLASS.violet}`}>
          <Spinner size={12} /> Tekshirilmoqda
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-400">Chek adminga yuborildi. Tasdiqlangach balans avtomatik to‘ladi va botga xabar keladi.</p>
    </div>
  );
}

function NewTopup({ cards, suggested, disabled, onCreated }: { cards: PaymentCard[]; suggested: number; disabled: boolean; onCreated: () => void }) {
  const initial = suggested > 0 ? Math.ceil(suggested / 1000) * 1000 : 0;
  const [amount, setAmount] = useState(initial ? String(initial) : "");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const value = Number(amount.replace(/\D/g, "")) || 0;

  useEffect(() => {
    if (!cards.some((c) => c.id === cardId)) setCardId(cards[0]?.id ?? "");
  }, [cards, cardId]);

  async function submit() {
    if (value < 1000) return setErr("Eng kam summa — 1 000 so‘m");
    haptic.tap();
    setBusy(true);
    setErr(null);
    try {
      await api("/topups", { body: { amount: value, cardId, idempotencyKey: key.current } });
      key.current = newIdempotencyKey();
      haptic.success();
      onCreated();
    } catch (e) {
      setErr(errorMessage(e));
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 animate-fade-up">
      <p className="font-display text-base font-bold text-white">➕ Hisobni to‘ldirish</p>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">Summa</label>
      <div className="relative mt-2">
        <input
          className="input pr-16 text-lg font-bold"
          inputMode="numeric"
          placeholder="50 000"
          value={value ? formatNumber(value) : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">so‘m</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => { haptic.select(); setAmount(String(q)); }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${value === q ? "border-neon-blue/60 bg-neon-blue/15 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
          >
            {formatNumber(q)}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Qaysi kartaga o‘tkazasiz?</label>
      <div className="mt-2 space-y-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { haptic.select(); setCardId(c.id); }}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${cardId === c.id ? "border-neon-blue/60 bg-neon-blue/10" : "border-white/10 hover:bg-white/5"}`}
          >
            <CreditCard size={20} className={cardId === c.id ? "text-neon-blue" : "text-slate-500"} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">{c.bankLabel} •••• {c.number.slice(-4)}</span>
              {c.holder && <span className="block truncate text-xs text-slate-400">{c.holder}</span>}
            </span>
            {cardId === c.id && <Check size={18} className="text-neon-blue" />}
          </button>
        ))}
      </div>

      {err && <div className="mt-4"><Alert>{err}</Alert></div>}
      {disabled && <div className="mt-4"><Alert tone="amber">Tekshirilmagan 3 ta so‘rovingiz bor. Ular tasdiqlanishini kuting.</Alert></div>}

      <button className="btn-primary mt-5 w-full py-4" onClick={submit} disabled={busy || disabled || !cardId || value < 1000}>
        {busy ? <Spinner size={18} /> : null} Davom etish
      </button>
    </section>
  );
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(value)) {
          haptic.success();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-ink-950/60 px-4 py-3 text-left ring-1 ring-white/5 active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="block whitespace-nowrap font-mono text-[15px] font-bold text-white min-[380px]:text-base">{display ?? value}</span>
      </span>
      <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${copied ? "text-emerald-300" : "text-neon-blue"}`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        <span className="hidden min-[400px]:inline">{copied ? "Nusxalandi" : "Nusxa"}</span>
      </span>
    </button>
  );
}

function TransferCard({ t, onUploaded }: { t: Topup; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    haptic.tap();
    setBusy(true);
    setErr(null);
    try {
      const image = await compressImage(f);
      await api(`/topups/${t.topupNo}/receipt`, { body: { image } });
      haptic.success();
      onUploaded();
    } catch (e) {
      setErr(errorMessage(e));
      haptic.error();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="card-glow p-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-bold text-white">🧾 #{t.topupNo}</p>
        <span className={`chip ${TONE_CLASS.amber}`}>Chek kutilmoqda</span>
      </div>

      <p className="mt-4 text-sm text-slate-300">
        <b className="text-white">1.</b> Quyidagi kartaga <b className="text-white">aniq {formatSum(t.amount)}</b> o‘tkazing:
      </p>
      <div className="mt-3 space-y-2">
        <CopyRow label={`${t.card.bankLabel} karta raqami`} value={t.card.number} display={formatCard(t.card.number)} />
        <CopyRow label="Summa" value={String(t.amount)} display={formatSum(t.amount)} />
        {t.card.holder && <p className="px-1 text-xs text-slate-400">Karta egasi: <b className="text-slate-200">{t.card.holder}</b></p>}
      </div>

      <p className="mt-5 text-sm text-slate-300">
        <b className="text-white">2.</b> O‘tkazma chekining rasmini (skrinshot) yuklang:
      </p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <button className="btn-primary mt-3 w-full py-4" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Spinner size={18} /> : <ImageUp size={18} />} {busy ? "Yuborilmoqda..." : "Chekni yuklash"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">yoki chek rasmini botga oddiy rasm qilib yuboring</p>
      <p className="mt-3 text-center text-[11px] text-slate-500">⏳ Chek 3 soat ichida yuborilmasa, so‘rov yopiladi</p>
    </section>
  );
}

function History({ data }: { data: WalletData }) {
  const [tab, setTab] = useState<"tx" | "topups">("tx");
  const items = tab === "tx" ? data.transactions : data.topups;
  return (
    <section className="card p-4 animate-fade-up">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-ink-950/60 p-1 ring-1 ring-white/5">
        {(["tx", "topups"] as const).map((k) => (
          <button key={k} onClick={() => { haptic.select(); setTab(k); }} className={`rounded-xl py-2 text-xs font-semibold transition ${tab === k ? "bg-white/10 text-white" : "text-slate-400"}`}>
            {k === "tx" ? "Harakatlar" : "To‘ldirishlar"}
          </button>
        ))}
      </div>
      {items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Hozircha bo‘sh</p>}
      <div className="divide-y divide-white/5">
        {tab === "tx"
          ? data.transactions.map((x) => (
              <div key={x.id} className="flex items-center gap-3 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${x.delta > 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                  {x.delta > 0 ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{TX_KIND[x.kind] ?? x.kind}{x.ref ? ` · #${x.ref}` : ""}</span>
                  <span className="block truncate text-xs text-slate-500">{x.note ? `${x.note} · ` : ""}{formatDateTime(x.createdAt)}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold ${x.delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {x.delta > 0 ? "+" : "−"}{formatNumber(Math.abs(x.delta))}
                </span>
              </div>
            ))
          : data.topups.map((t) => {
              const m = TOPUP_STATUS[t.status];
              return (
                <div key={t.topupNo} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">#{t.topupNo} · {formatSum(t.credited ?? t.amount)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {t.card.bankLabel} •••• {t.card.number.slice(-4)} · {formatDateTime(t.createdAt)}
                    </span>
                    {t.status === "REJECTED" && t.rejectReason && <span className="block text-xs text-rose-300/90">{t.rejectReason}</span>}
                  </span>
                  <span className={`chip shrink-0 ${TONE_CLASS[m.tone]}`}>{m.emoji} {m.short}</span>
                </div>
              );
            })}
      </div>
    </section>
  );
}

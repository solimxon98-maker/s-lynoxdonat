import { CheckCheck, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, OrderStatusBadge, PageHeader, PaymentStatusBadge, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { TIER_META } from "../lib/tier";
import { listOrders } from "../lib/adminData";
import { formatDateTime, productEmoji, productText, formatSum, tashkentDateFromInput, tashkentDayStart } from "../lib/format";
import type { OrderRecord, OrderStatus } from "../lib/types";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Bugun" },
  { id: "yesterday", label: "Kecha" },
  { id: "7d", label: "7 kun" },
  { id: "30d", label: "30 kun" },
  { id: "custom", label: "Custom" },
];

const STATUS_FILTERS: { id: OrderStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "Barchasi" },
  { id: "AWAITING_PAYMENT", label: "⏳ Kutilmoqda" },
  { id: "PAID", label: "💳 To‘langan" },
  { id: "PROCESSING", label: "🔄 Jarayonda" },
  { id: "SUCCESS", label: "✅ Muvaffaqiyatli" },
  { id: "FAILED", label: "❌ Xato" },
  { id: "CANCELLED", label: "🚫 Bekor" },
  { id: "REFUNDED", label: "↩️ Qaytarilgan" },
];

function range(preset: Preset, from: string, to: string): { start: Date; end: Date } | null {
  const now = new Date(Date.now() + 60_000);
  switch (preset) {
    case "today":
      return { start: tashkentDayStart(0), end: now };
    case "yesterday":
      return { start: tashkentDayStart(-1), end: new Date(tashkentDayStart(0).getTime() - 1) };
    case "7d":
      return { start: tashkentDayStart(-6), end: now };
    case "30d":
      return { start: tashkentDayStart(-29), end: now };
    case "custom": {
      const s = tashkentDateFromInput(from);
      const e = tashkentDateFromInput(to, true);
      return s && e && s <= e ? { start: s, end: e } : null;
    }
  }
}

const MAX_ROWS = 1000;

export function AdminOrdersPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = range(preset, from, to);
    if (!r) {
      setError("Custom sana oralig‘ini to‘g‘ri tanlang");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrders(await listOrders(r.start, r.end, MAX_ROWS));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    if (preset !== "custom") load();
  }, [preset, load]);

  const filtered = useMemo(() => {
    if (!orders) return null;
    const s = search.trim().toLowerCase().replace(/^#/, "");
    return orders.filter((o) => {
      if (status !== "ALL" && o.status !== status) return false;
      if (!s) return true;
      return (
        o.orderNo.toLowerCase().includes(s) ||
        o.mlbbId.includes(s) ||
        (o.nickname ?? "").toLowerCase().includes(s) ||
        o.telegramId.includes(s) ||
        (o.username ?? "").toLowerCase().includes(s)
      );
    });
  }, [orders, search, status]);

  const totals = useMemo(() => {
    if (!filtered) return null;
    const paid = filtered.filter((o) => o.paymentStatus === "PAID");
    return { count: filtered.length, revenue: paid.reduce((a, o) => a + o.amount, 0) };
  }, [filtered]);

  async function runAction(o: OrderRecord, action: "retry" | "mark-success" | "refund") {
    const msg =
      action === "retry"
        ? `#${o.orderNo} buyurtmani FastDonate ga qayta yuborasizmi?`
        : action === "refund"
          ? `#${o.orderNo} — ${formatSum(o.amount)} mijoz balansiga qaytarilsinmi? (Buyurtma yopiladi, qayta yuborib bo‘lmaydi)`
          : `#${o.orderNo} ni qo‘lda "muvaffaqiyatli" deb belgilaysizmi? (Diamond qo‘lda yuborilgan bo‘lsa)`;
    if (!window.confirm(msg)) return;
    setActionBusy(o.id);
    try {
      await api(`/admin/orders/${encodeURIComponent(o.id)}/${action}`, { body: {}, admin: true });
      await load();
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Buyurtmalar"
        subtitle={totals ? `${totals.count} ta · to‘langan: ${formatSum(totals.revenue)}` : undefined}
        right={
          <button className="btn-ghost px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? <Spinner size={16} /> : <RefreshCw size={16} />} Yangilash
          </button>
        }
      />

      <div className="card mb-4 space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                preset === p.id ? "bg-neon-blue/15 text-white ring-1 ring-neon-blue/40" : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Dan</label>
              <input type="date" className="input py-2.5" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Gacha</label>
              <input type="date" className="input py-2.5" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn-primary py-2.5" onClick={load} disabled={loading}>
              Ko‘rsatish
            </button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input py-2.5 pl-11"
              placeholder="Order ID, MLBB ID, Nickname, Telegram ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input py-2.5" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "ALL")}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.id} value={s.id} className="bg-ink-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {orders && orders.length >= MAX_ROWS && (
          <p className="text-xs text-amber-300">Faqat oxirgi {MAX_ROWS} ta buyurtma ko‘rsatildi — oraliqni qisqartiring.</p>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {filtered && filtered.length === 0 && <p className="card px-5 py-10 text-center text-sm text-slate-500">Buyurtmalar topilmadi</p>}

      {filtered && filtered.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Telegram user</th>
                <th className="px-4 py-3">MLBB ID</th>
                <th className="px-4 py-3">Server</th>
                <th className="px-4 py-3">Nickname</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Donat</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-3 font-bold text-white">
                    #{o.orderNo}
                    {o.mock && <span className="ml-1 text-[10px] text-amber-300">TEST</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white">{o.username ? `@${o.username}` : o.firstName}</p>
                    <p className="text-xs text-slate-500">{o.telegramId}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{o.mlbbId}</td>
                  <td className="px-4 py-3 font-mono text-xs">{o.serverId}</td>
                  <td className="px-4 py-3">{o.nickname}</td>
                  <td className="px-4 py-3">{productEmoji(o.product)} {productText(o.product)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-neon-blue">
                    {formatSum(o.amount)}
                    {o.priceTier && o.priceTier !== "oddiy" && (
                      <span className={`chip ml-1 px-1.5 py-0 text-[10px] ${TIER_META[o.priceTier].chip}`}>{TIER_META[o.priceTier].emoji}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                    {o.lastError && (
                      <p className="mt-1 max-w-[220px] text-xs text-rose-300/80" title={o.lastError.message}>
                        {o.lastError.code}: {o.lastError.message}
                      </p>
                    )}
                    {o.attempts > 1 && <p className="mt-1 text-[11px] text-slate-500">Urinishlar: {o.attempts}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDateTime(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {o.status === "FAILED" && o.paymentStatus === "PAID" && (
                        <button
                          className="btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => runAction(o, "retry")}
                          disabled={actionBusy === o.id}
                          title="Qayta yuborish"
                        >
                          <RotateCcw size={14} /> Qayta
                        </button>
                      )}
                      {(o.status === "FAILED" || o.status === "PROCESSING") && o.paymentStatus === "PAID" && (
                        <button
                          className="btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => runAction(o, "mark-success")}
                          disabled={actionBusy === o.id}
                          title="Qo‘lda bajarildi"
                        >
                          <CheckCheck size={14} /> Bajarildi
                        </button>
                      )}
                      {o.status === "FAILED" && o.paymentStatus === "PAID" && o.paymentProvider === "balance" && (
                        <button
                          className="btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => runAction(o, "refund")}
                          disabled={actionBusy === o.id}
                          title="Pulni mijoz balansiga qaytarish"
                        >
                          ↩️ Balansga
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

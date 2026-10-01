import { Check, Image as ImageIcon, RefreshCw, X } from "lucide-react";
import { dialog } from "../components/Dialog";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { listTopups } from "../lib/adminData";
import { formatDateTime, formatNumber, formatSum, TONE_CLASS, TOPUP_STATUS } from "../lib/format";
import type { TopupRecord } from "../lib/types";

/**
 * To'ldirish so'rovlari. Admin bank ilovasida pul tushganini tekshirib, tasdiqlaydi.
 * Xuddi shu tugmalar botda ham bor — qaysi birida bosilsa ham balans faqat bir marta to'ladi.
 */
export function TopupsPage() {
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");
  const [rows, setRows] = useState<TopupRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ no: string; src: string | null; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listTopups(tab));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(id);
  }, [load]);

  async function showReceipt(t: TopupRecord) {
    setReceipt({ no: t.topupNo, src: null });
    try {
      const r = await api<{ dataUrl: string }>(`/admin/topups/${t.topupNo}/receipt`, { admin: true });
      setReceipt({ no: t.topupNo, src: r.dataUrl });
    } catch (e) {
      setReceipt({ no: t.topupNo, src: null, error: errorMessage(e) });
    }
  }

  async function approve(t: TopupRecord) {
    const raw = await dialog.prompt(
      `#${t.topupNo} — ${label(t)}\nSo‘rov: ${formatSum(t.amount)}\n\nBank ilovangizda tekshiring! Kartaga haqiqatda tushgan summa:`,
      String(t.amount),
    );
    if (raw === null) return;
    const amount = Number(raw.replace(/[\s,.]/g, ""));
    if (!Number.isInteger(amount) || amount < 1) return void void dialog.alert("Summani raqam bilan kiriting");
    setBusy(t.topupNo);
    try {
      await api(`/admin/topups/${t.topupNo}/approve`, { body: { amount }, admin: true });
      await load();
    } catch (e) {
      void dialog.alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function reject(t: TopupRecord) {
    const reason = await dialog.prompt(`#${t.topupNo} rad etilsinmi? Sabab (mijozga yuboriladi):`, "Pul kartaga tushmadi");
    if (reason === null) return;
    setBusy(t.topupNo);
    try {
      await api(`/admin/topups/${t.topupNo}/reject`, { body: { reason }, admin: true });
      await load();
    } catch (e) {
      void dialog.alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="To‘ldirishlar"
        subtitle="Kartaga o‘tkazma → chek → tasdiqlash"
        right={
          <button className="btn-ghost px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? <Spinner size={16} /> : <RefreshCw size={16} />} Yangilash
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["PENDING", "ALL"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${tab === k ? "border-neon-blue/50 bg-neon-blue/10 text-white" : "border-white/10 text-slate-400"}`}>
            {k === "PENDING" ? "⏳ Tekshirilishi kerak" : "Barchasi"}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Alert tone="amber">⚠️ Tasdiqlashdan oldin <b>bank ilovangizda pul haqiqatan tushganini tekshiring</b>. Chek rasmi soxta bo‘lishi mumkin.</Alert>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {rows && rows.length === 0 && <p className="card px-5 py-10 text-center text-sm text-slate-500">So‘rovlar yo‘q</p>}

      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">So‘rov</th>
                <th className="px-4 py-3">Mijoz</th>
                <th className="px-4 py-3">Summa</th>
                <th className="px-4 py-3">Karta</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Chek</th>
                <th className="px-4 py-3 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((t) => {
                const m = TOPUP_STATUS[t.status];
                const open = t.status === "PENDING" || t.status === "AWAITING_RECEIPT";
                return (
                  <tr key={t.topupNo}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <b className="text-white">#{t.topupNo}</b>
                      <p className="text-xs text-slate-500">{formatDateTime(t.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white">{t.username ? `@${t.username}` : t.firstName || "—"}</p>
                      <p className="font-mono text-xs text-slate-500">{t.userId}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <b className="text-neon-blue">{formatSum(t.credited ?? t.amount)}</b>
                      {t.credited !== null && t.credited !== t.amount && <p className="text-xs text-slate-500">so‘rov: {formatNumber(t.amount)}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-300">
                      {t.card.bankLabel} •••• {t.card.number.slice(-4)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${TONE_CLASS[m.tone]}`}>{m.emoji} {m.short}</span>
                      {t.rejectReason && <p className="mt-1 max-w-[200px] text-xs text-rose-300/90">{t.rejectReason}</p>}
                      {t.decidedAt && <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(t.decidedAt)} · {t.decidedBy?.startsWith("tg:") ? "bot" : "panel"}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {t.hasReceipt ? (
                        <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => showReceipt(t)}>
                          <ImageIcon size={14} /> Ko‘rish
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">yo‘q</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {open && (
                        <div className="flex justify-end gap-1.5">
                          <button className="whitespace-nowrap rounded-lg border border-emerald-400/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10" disabled={busy === t.topupNo} onClick={() => approve(t)}>
                            <Check size={14} className="-mt-0.5 mr-1 inline" /> Tasdiqlash
                          </button>
                          <button className="whitespace-nowrap rounded-lg border border-rose-400/40 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-400/10" disabled={busy === t.topupNo} onClick={() => reject(t)}>
                            <X size={14} className="-mt-0.5 mr-1 inline" /> Rad
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setReceipt(null)}>
          <div className="card-glow max-h-[92vh] w-full max-w-lg overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display font-bold text-white">🧾 #{receipt.no} cheki</p>
              <button className="rounded-full p-2 text-slate-400 hover:bg-white/5" onClick={() => setReceipt(null)} aria-label="Yopish">
                <X size={18} />
              </button>
            </div>
            {receipt.error ? <Alert>{receipt.error}</Alert> : receipt.src ? <img src={receipt.src} alt="Chek" className="w-full rounded-xl" /> : <div className="flex justify-center py-16"><Spinner /></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function label(t: TopupRecord) {
  return t.username ? `@${t.username}` : t.firstName || t.userId;
}

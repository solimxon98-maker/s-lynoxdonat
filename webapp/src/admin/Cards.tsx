import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { dialog } from "../components/Dialog";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { type CardInput, createCard, deleteCard, listCards, updateCard } from "../lib/adminData";
import { formatCard } from "../lib/format";
import type { CardBank, PaymentCard } from "../lib/types";

const BANKS: { id: CardBank; label: string }[] = [
  { id: "humo", label: "Humo" },
  { id: "uzcard", label: "Uzcard" },
  { id: "uzum", label: "Uzum" },
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "other", label: "Boshqa" },
];

const EMPTY: CardInput = { bank: "humo", number: "", holder: "", note: "", active: true, sortOrder: 0 };

/** Mijozlar pul o'tkazadigan kartalar. Faol kartalar Web App'da "Hisobni to'ldirish" oynasida ko'rinadi. */
export function CardsPage() {
  const [cards, setCards] = useState<PaymentCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; v: CardInput } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCards(await listCards());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!edit) return;
    const digits = edit.v.number.replace(/\D/g, "");
    if (digits.length !== 16) return setFormError("Karta raqami 16 ta raqam bo‘lishi kerak");
    setSaving(true);
    setFormError(null);
    try {
      if (edit.id) await updateCard(edit.id, { ...edit.v, number: digits });
      else await createCard({ ...edit.v, number: digits });
      setEdit(null);
      await load();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: PaymentCard) {
    try {
      await updateCard(c.id, { bank: c.bank, number: c.number, holder: c.holder, note: c.note, active: !c.active, sortOrder: c.sortOrder ?? 0 });
      await load();
    } catch (e) {
      void dialog.alert(errorMessage(e));
    }
  }

  async function remove(c: PaymentCard) {
    if (!await dialog.confirm(`${c.bankLabel} •••• ${c.number.slice(-4)} o‘chirilsinmi? (Eski so‘rovlarda karta ma'lumoti saqlanib qoladi)`)) return;
    try {
      await deleteCard(c.id);
      await load();
    } catch (e) {
      void dialog.alert(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Kartalar"
        subtitle="Mijozlar shu kartalarga pul o‘tkazadi"
        right={
          <button className="btn-primary px-4 py-2 text-sm" onClick={() => { setFormError(null); setEdit({ id: null, v: { ...EMPTY, sortOrder: (cards?.length ?? 0) + 1 } }); }}>
            <Plus size={16} /> Karta qo‘shish
          </button>
        }
      />

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {cards && cards.length === 0 && (
        <div className="card px-5 py-10 text-center text-sm text-slate-400">
          Hali karta yo‘q. «Karta qo‘shish» ni bosing — shunda mijozlar hisobini to‘ldira oladi.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {cards?.map((c) => (
          <div key={c.id} className={`card p-5 ${c.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 text-neon-blue ring-1 ring-white/10">
                  <CreditCard size={20} />
                </span>
                <div>
                  <p className="font-display text-lg font-bold tracking-wide text-white">{formatCard(c.number)}</p>
                  <p className="text-xs text-slate-400">{c.bankLabel}{c.holder ? ` · ${c.holder}` : ""}</p>
                </div>
              </div>
              <span className={`chip ${c.active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-400/20 bg-slate-400/10 text-slate-300"}`}>
                {c.active ? "Faol" : "O‘chiq"}
              </span>
            </div>
            {c.note && <p className="mt-3 text-xs text-slate-400">{c.note}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setFormError(null); setEdit({ id: c.id, v: { bank: c.bank, number: c.number, holder: c.holder, note: c.note, active: !!c.active, sortOrder: c.sortOrder ?? 0 } }); }}>
                <Pencil size={14} /> Tahrirlash
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => toggle(c)}>
                {c.active ? "O‘chirib qo‘yish" : "Yoqish"}
              </button>
              <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(c)}>
                <Trash2 size={14} /> O‘chirish
              </button>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setEdit(null)}>
          <div className="card-glow w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold text-white">{edit.id ? "Kartani tahrirlash" : "Yangi karta"}</p>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {BANKS.map((b) => (
                  <button key={b.id} type="button" onClick={() => setEdit({ ...edit, v: { ...edit.v, bank: b.id } })} className={`rounded-xl border px-3 py-1.5 text-sm ${edit.v.bank === b.id ? "border-neon-blue/60 bg-neon-blue/10 text-white" : "border-white/10 text-slate-400"}`}>
                    {b.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-slate-400">
                Karta raqami (16 ta raqam)
                <input className="input mt-1 font-mono text-lg" inputMode="numeric" placeholder="9860 1234 5678 9012" value={formatCard(edit.v.number)} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, number: e.target.value.replace(/\D/g, "").slice(0, 16) } })} />
              </label>
              <label className="block text-xs text-slate-400">
                Karta egasi (mijozga ko‘rinadi)
                <input className="input mt-1" placeholder="SOLIM X." maxLength={80} value={edit.v.holder} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, holder: e.target.value } })} />
              </label>
              <label className="block text-xs text-slate-400">
                Izoh (ixtiyoriy, faqat admin uchun)
                <input className="input mt-1" maxLength={200} value={edit.v.note} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, note: e.target.value } })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={edit.v.active} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, active: e.target.checked } })} />
                Faol (mijozlarga ko‘rinadi)
              </label>
            </div>
            {formError && <div className="mt-4"><Alert>{formError}</Alert></div>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEdit(null)} disabled={saving}>Bekor</button>
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? <Spinner size={16} /> : null} Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
